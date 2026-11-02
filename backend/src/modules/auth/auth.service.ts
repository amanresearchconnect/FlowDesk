import jwt from 'jsonwebtoken';
import { User, IUserDocument, UserRole } from '../../models/user.model.js';
import { env } from '../../config/env.js';
import { ConflictError, UnauthorizedError, NotFoundError } from '../../utils/errors.js';
import { RegisterInput, LoginInput } from './auth.validator.js';

export interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: ReturnType<IUserDocument['toSafeObject']>;
  tokens: AuthTokens;
}

export class AuthService {
  public static generateTokens(user: IUserDocument): AuthTokens {
    const payload: TokenPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role
    };

    const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRY
    } as jwt.SignOptions);

    const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRY
    } as jwt.SignOptions);

    return { accessToken, refreshToken };
  }

  public static async register(input: RegisterInput): Promise<AuthResult> {
    const existing = await User.findOne({ email: input.email });
    if (existing) {
      throw new ConflictError('A user with this email address already exists');
    }

    const passwordHash = await User.hashPassword(input.password);
    const user = await User.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      lastLoginAt: new Date()
    });

    const tokens = this.generateTokens(user);
    return {
      user: user.toSafeObject(),
      tokens
    };
  }

  public static async login(input: LoginInput): Promise<AuthResult> {
    const user = await User.findOne({ email: input.email }).select('+passwordHash');
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account has been deactivated. Please contact an administrator');
    }

    const isValidPassword = await user.comparePassword(input.password);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid email or password');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const tokens = this.generateTokens(user);
    return {
      user: user.toSafeObject(),
      tokens
    };
  }

  public static async refreshAccessToken(token: string): Promise<{ accessToken: string }> {
    try {
      const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
      const user = await User.findById(decoded.sub);

      if (!user || !user.isActive) {
        throw new UnauthorizedError('User account is invalid or deactivated');
      }

      const payload: TokenPayload = {
        sub: user._id.toString(),
        email: user.email,
        role: user.role
      };

      const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
        expiresIn: env.JWT_ACCESS_EXPIRY
      } as jwt.SignOptions);

      return { accessToken };
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  }

  public static async getProfile(userId: string): Promise<ReturnType<IUserDocument['toSafeObject']>> {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User profile not found');
    }
    return user.toSafeObject();
  }
}
