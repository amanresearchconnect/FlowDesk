import { interpolateTemplate } from '../utils/template.js';

const lastReplyText = 'AmanSingh,2468aman@gmail.com,surv-1202,8655021763';
const extracted: Record<string, string> = {};

const emailMatch = lastReplyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
if (emailMatch) extracted.email = emailMatch[0].trim();

const phoneMatch = lastReplyText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b\d{10,13}\b/);
if (phoneMatch) extracted.phone = phoneMatch[0].trim();

const surveyMatch =
  lastReplyText.match(/(?:survey[-_\s]?id|surveyid|id|code)[:\s#]*([a-zA-Z0-9-_]+)/i) ||
  lastReplyText.match(/\b(surv[-_]?[a-zA-Z0-9]+)\b/i) ||
  lastReplyText.match(/\b([A-Z]{2,}[-_][a-zA-Z0-9]+)\b/i);
if (surveyMatch) extracted.surveyId = (surveyMatch[1] || surveyMatch[0]).trim();

if (lastReplyText.includes(',')) {
  const tokens = lastReplyText.split(',').map((t) => t.trim());
  for (const token of tokens) {
    if (extracted.email && token.includes(extracted.email)) continue;
    if (extracted.phone && token.includes(extracted.phone)) continue;
    if (extracted.surveyId && token.includes(extracted.surveyId)) continue;
    if (/^[a-zA-Z\s]{2,40}$/.test(token)) {
      extracted.name = token;
      break;
    }
  }
}

const customFields = {
  ...extracted,
  lastReply: lastReplyText
};

const customColumns = ['{{Name}}', '{{Phone}}', '{{Email}}', '{{Survey-ID}}'];
const rowValues = customColumns.map(col => interpolateTemplate(col, { customFields }));
console.log('EXTRACTED DATA:', extracted);
console.log('RESULTING ROW VALUES:', rowValues);

