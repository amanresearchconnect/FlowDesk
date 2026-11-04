import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  UploadCloud,
  UserCheck,
  Search,
  Filter,
  CheckCircle2,
  FileSpreadsheet,
  ArrowRight,
  Database,
  MessageSquare,
  AlertCircle,
  Hash,
  Phone,
  RefreshCw,
  Plus
} from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { formatDate } from '../lib/utils';

interface Contact {
  id?: string;
  _id?: string;
  phoneNumber?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  tags: string[];
  optInStatus: string;
  customFields?: Record<string, any>;
  contactListId?: {
    _id?: string;
    id?: string;
    name: string;
  };
  contactListIds?: string[];
  createdAt: string;
}

interface ContactList {
  id?: string;
  _id?: string;
  name: string;
  description?: string;
  totalCount: number;
  createdAt: string;
}

interface UploadPreviewResponse {
  fileToken: string;
  headers: string[];
  detectedHeaders?: string[];
  previewRows: Record<string, any>[];
  sampleRows?: Record<string, any>[];
  rowCount: number;
  totalRows?: number;
  fileName: string;
  originalFileName?: string;
}

interface ImportSummary {
  listId: string;
  contactListId?: string;
  listName: string;
  totalProcessed: number;
  totalRows?: number;
  imported: number;
  validCount?: number;
  duplicatesSkipped: number;
  duplicateCount?: number;
  invalidSkipped: number;
  errorCount?: number;
}

export const Contacts: React.FC = () => {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'contacts' | 'lists'>('contacts');

  // Search & Filter State
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<'all' | 'verified' | 'unverified'>('all');
  const [selectedListId, setSelectedListId] = useState<string>('all');

  // Spreadsheet Ingestion Wizard State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2 | 3>(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [listName, setListName] = useState('');
  const [countryCode, setCountryCode] = useState('IN');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<UploadPreviewResponse | null>(null);

  // Column Mappings
  const [phoneColumn, setPhoneColumn] = useState('');
  const [firstNameColumn, setFirstNameColumn] = useState('');
  const [lastNameColumn, setLastNameColumn] = useState('');
  const [emailColumn, setEmailColumn] = useState('');
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);

  // Single Contact Creation Modal
  const [isNewContactOpen, setIsNewContactOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [createContactError, setCreateContactError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [contactsRes, listsRes] = await Promise.all([
        api.get<any[]>('/contacts?limit=100'),
        api.get<any[]>('/contact-lists')
      ]);

      if (contactsRes.success && contactsRes.data) {
        const normalizedContacts = (contactsRes.data || []).map((c: any) => ({
          ...c,
          id: c.id || c._id,
          _id: c.id || c._id,
          phone: c.phone || c.phoneNumber || '',
          phoneNumber: c.phoneNumber || c.phone || '',
          tags: Array.isArray(c.tags) ? c.tags : []
        }));
        setContacts(normalizedContacts);
      }
      if (listsRes.success && listsRes.data) {
        const normalizedLists = (listsRes.data || []).map((l: any) => ({
          ...l,
          id: l.id || l._id,
          _id: l.id || l._id
        }));
        setContactLists(normalizedLists);
      }
    } catch (err: any) {
      console.error('Failed to load contacts data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 1: Upload File & Get Preview
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!listName) {
        // Auto-fill list name from file name without extension
        const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        setListName(baseName.charAt(0).toUpperCase() + baseName.slice(1));
      }
      setUploadError(null);
    }
  };

  const handleUploadAndAnalyze = async () => {
    if (!selectedFile) {
      setUploadError('Please select a CSV or Excel file.');
      return;
    }
    if (!listName.trim()) {
      setUploadError('Please specify a target contact list name.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await api.post<any>('/contacts/upload-preview', formData);

      if (res && res.data) {
        const raw = res.data;
        const headers: string[] = raw.detectedHeaders || raw.headers || [];
        const previewRows: Record<string, any>[] = raw.sampleRows || raw.previewRows || [];
        const rowCount = raw.totalRows !== undefined ? raw.totalRows : raw.rowCount || previewRows.length || 0;
        const fileName = raw.originalFileName || raw.fileName || selectedFile.name;

        setPreviewData({
          fileToken: raw.fileToken,
          headers,
          detectedHeaders: headers,
          previewRows,
          sampleRows: previewRows,
          rowCount,
          totalRows: rowCount,
          fileName,
          originalFileName: fileName
        });

        // Smart auto-detect column mappings
        const headersLower = headers.map((h: string) => h.toLowerCase());
        const phoneIdx = headersLower.findIndex((h: string) =>
          h.includes('phone') || h.includes('mobile') || h.includes('whatsapp') || h.includes('contact') || h.includes('number')
        );
        if (phoneIdx !== -1) setPhoneColumn(headers[phoneIdx]);

        const firstIdx = headersLower.findIndex((h: string) =>
          h.includes('first') || h.includes('fname') || (h.includes('name') && !h.includes('last'))
        );
        if (firstIdx !== -1) setFirstNameColumn(headers[firstIdx]);

        const lastIdx = headersLower.findIndex((h: string) =>
          h.includes('last') || h.includes('lname') || h.includes('surname')
        );
        if (lastIdx !== -1) setLastNameColumn(headers[lastIdx]);

        const emailIdx = headersLower.findIndex((h: string) =>
          h.includes('email') || h.includes('mail')
        );
        if (emailIdx !== -1) setEmailColumn(headers[emailIdx]);

        setImportStep(2);
      }
    } catch (err: any) {
      setUploadError(err.response?.data?.message || err.message || 'Failed to parse file preview.');
    } finally {
      setIsUploading(false);
    }
  };

  // Step 2: Confirm Ingestion
  const handleConfirmImport = async () => {
    if (!previewData || !phoneColumn) {
      setUploadError('Phone column mapping is mandatory.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const payload = {
        fileToken: previewData.fileToken,
        listName: listName.trim(),
        countryCode: countryCode || 'IN',
        tags: ['imported_batch'],
        mappings: {
          phone: phoneColumn,
          firstName: firstNameColumn || undefined,
          lastName: lastNameColumn || undefined,
          email: emailColumn || undefined,
          customFields: {}
        }
      };

      const res = await api.post<any>('/contacts/import', payload);
      if (res.data) {
        const raw = res.data;
        setImportResult({
          listId: raw.contactListId || raw.listId || '',
          listName: raw.listName || listName.trim(),
          totalProcessed: raw.totalRows !== undefined ? raw.totalRows : raw.totalProcessed || 0,
          imported: raw.validCount !== undefined ? raw.validCount : raw.imported || 0,
          duplicatesSkipped: raw.duplicateCount !== undefined ? raw.duplicateCount : raw.duplicatesSkipped || 0,
          invalidSkipped: raw.errorCount !== undefined ? raw.errorCount : raw.invalidSkipped || 0
        });
      }
      setImportStep(3);
      loadData();
    } catch (err: any) {
      setUploadError(err.response?.data?.message || err.message || 'Import ingestion failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleResetImportModal = () => {
    setIsImportModalOpen(false);
    setImportStep(1);
    setSelectedFile(null);
    setListName('');
    setPreviewData(null);
    setUploadError(null);
    setPhoneColumn('');
    setFirstNameColumn('');
    setLastNameColumn('');
    setEmailColumn('');
    setImportResult(null);
  };

  // Filtered contacts
  const filteredContacts = contacts.filter((c) => {
    const fullName = `${c.firstName || ''} ${c.lastName || ''}`.toLowerCase();
    const phone = c.phoneNumber || c.phone || '';
    const matchesSearch =
      !search ||
      fullName.includes(search.toLowerCase()) ||
      phone.includes(search);

    const matchesList =
      selectedListId === 'all' ||
      c.contactListId?._id === selectedListId ||
      c.contactListId?.id === selectedListId ||
      c.contactListIds?.includes(selectedListId) ||
      c.contactListId === (selectedListId as any);

    const isVerified = c.tags?.includes('survey_verified');
    const matchesTag =
      tagFilter === 'all' ||
      (tagFilter === 'verified' && isVerified) ||
      (tagFilter === 'unverified' && !isVerified);

    return matchesSearch && matchesList && matchesTag;
  });

  const verifiedCount = contacts.filter((c) => c.tags?.includes('survey_verified')).length;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Top Header */}
      <header className="px-8 py-6 bg-white border-b border-slate-200 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Contacts & Data Ingestion
              </h1>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {contacts.length} total
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Manage candidate profiles, spreadsheet imports, and survey verification tags
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              className="gap-2"
              title="Refresh contact records"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Refresh</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsImportModalOpen(true)}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Import Spreadsheet</span>
            </Button>
          </div>
        </div>

        {/* Operational KPI Metric Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <Card className="p-4 bg-white border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Total Candidates
              </span>
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{contacts.length}</p>
            <p className="text-xs text-slate-500 mt-1">E.164 normalized database</p>
          </Card>

          <Card className="p-4 bg-white border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Survey Verified
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                <UserCheck className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-emerald-600 mt-2">{verifiedCount}</p>
            <p className="text-xs text-slate-500 mt-1">
              {contacts.length > 0
                ? `${Math.round((verifiedCount / contacts.length) * 100)}% verified on Sheets`
                : '0% verified'}
            </p>
          </Card>

          <Card className="p-4 bg-white border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Contact Lists
              </span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                <Database className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{contactLists.length}</p>
            <p className="text-xs text-slate-500 mt-1">Ingested cohort segments</p>
          </Card>

          <Card className="p-4 bg-white border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Sync Engine
              </span>
              <div className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">Active</p>
            <p className="text-xs text-slate-500 mt-1">Google Sheets 60s TTL Cache</p>
          </Card>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0 px-8 py-6 overflow-hidden">
        {/* Sub-Tabs & Filtering Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 shrink-0">
          <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-lg w-fit border border-slate-300">
            <button
              onClick={() => setActiveTab('contacts')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'contacts'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Candidate Directory ({contacts.length})
            </button>
            <button
              onClick={() => setActiveTab('lists')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'lists'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Target Lists ({contactLists.length})
            </button>
          </div>

          {activeTab === 'contacts' && (
            <div className="flex flex-wrap items-center gap-3">
              {/* Search Bar */}
              <div className="relative w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search name or phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              {/* Tag / Verification Filter */}
              <div className="flex items-center gap-1 text-xs">
                <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
                <button
                  onClick={() => setTagFilter('all')}
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    tagFilter === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setTagFilter('verified')}
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    tagFilter === 'verified'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Verified Only
                </button>
                <button
                  onClick={() => setTagFilter('unverified')}
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    tagFilter === 'unverified'
                      ? 'bg-amber-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Unverified
                </button>
              </div>

              {/* Contact List Filter */}
              {contactLists.length > 0 && (
                <select
                  value={selectedListId}
                  onChange={(e) => setSelectedListId(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="all">All Ingestion Lists</option>
                  {contactLists.map((l) => (
                    <option key={l.id || l._id} value={l.id || l._id}>
                      {l.name} ({l.totalCount})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Tab 1: Contacts Directory Table */}
        {activeTab === 'contacts' && (
          <Card className="flex-1 overflow-hidden flex flex-col border-slate-200 shadow-xs bg-white">
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin mb-2" />
                  <p className="text-sm">Loading candidate records...</p>
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                  <Users className="w-10 h-10 stroke-[1.5] text-slate-300 mb-2" />
                  <p className="text-sm font-medium text-slate-600">No contacts found</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {search || tagFilter !== 'all'
                      ? 'Try clearing the search query or filters'
                      : 'Upload a spreadsheet or add your first candidate'}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsImportModalOpen(true)}
                    className="mt-4 gap-2 text-xs"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Upload CSV / Excel</span>
                  </Button>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 sticky top-0 z-10 font-semibold text-slate-600 uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4">Candidate</th>
                      <th className="py-3 px-4">Phone Number</th>
                      <th className="py-3 px-4">Cohort List</th>
                      <th className="py-3 px-4">Google Sheets Status</th>
                      <th className="py-3 px-4">Profile Metadata</th>
                      <th className="py-3 px-4">Ingested At</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredContacts.map((contact) => {
                      const isVerified = contact.tags?.includes('survey_verified');
                      const initials =
                        (contact.firstName?.[0] || '') + (contact.lastName?.[0] || '') || 'C';

                      return (
                        <tr key={contact.id || contact._id} className="hover:bg-slate-50/80 transition-colors group">
                          {/* Name & Avatar */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-[10px] text-slate-700 uppercase shrink-0">
                                {initials}
                              </div>
                              <div>
                                <p className="font-medium text-slate-900">
                                  {contact.firstName || contact.lastName
                                    ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
                                    : 'Candidate'}
                                </p>
                                {contact.email && (
                                  <p className="text-[10px] text-slate-400 truncate max-w-[140px]">
                                    {contact.email}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Phone Number */}
                          <td className="py-3 px-4 font-mono font-medium text-slate-700">
                            {contact.phoneNumber || contact.phone}
                          </td>

                          {/* Ingestion List */}
                          <td className="py-3 px-4 text-slate-600">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200/80">
                              <Database className="w-3 h-3 text-slate-400" />
                              <span className="truncate max-w-[130px]">
                                {contact.contactListId?.name || 'Default Ingest'}
                              </span>
                            </span>
                          </td>

                          {/* Google Sheets Survey Verification */}
                          <td className="py-3 px-4">
                            {isVerified ? (
                              <Badge variant="emerald" className="gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Survey Verified</span>
                              </Badge>
                            ) : (
                              <Badge variant="slate" className="gap-1 text-slate-500">
                                <span>Unverified</span>
                              </Badge>
                            )}
                          </td>

                          {/* Profile Metadata Custom Fields */}
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {contact.customFields && Object.keys(contact.customFields).length > 0 ? (
                                Object.entries(contact.customFields)
                                  .slice(0, 2)
                                  .map(([k, v]) => (
                                    <span
                                      key={k}
                                      className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] border border-slate-200"
                                      title={`${k}: ${String(v)}`}
                                    >
                                      {k}: {String(v)}
                                    </span>
                                  ))
                              ) : (
                                <span className="text-[10px] text-slate-400">None</span>
                              )}
                            </div>
                          </td>

                          {/* Date */}
                          <td className="py-3 px-4 text-slate-500">
                            {formatDate(contact.createdAt)}
                          </td>

                          {/* Action: Quick Message */}
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => navigate(`/inbox`)}
                              title="Open conversation in Team Inbox"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md border border-emerald-200/60 transition-colors"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Inbox</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Table Footer */}
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
              <span>
                Showing {filteredContacts.length} of {contacts.length} candidate records
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                E.164 phone standard compliant
              </span>
            </div>
          </Card>
        )}

        {/* Tab 2: Target Lists Overview */}
        {activeTab === 'lists' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto">
            {contactLists.map((list) => (
              <Card key={list.id || list._id} className="p-5 border-slate-200 bg-white shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                      <Database className="w-4 h-4" />
                    </div>
                    <Badge variant="indigo" className="font-mono">
                      {list.totalCount} contacts
                    </Badge>
                  </div>
                  <h3 className="font-semibold text-slate-900 text-base mt-3">{list.name}</h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                    {list.description || 'Target campaign segment for automated recruitment flows.'}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                  <span>Created {formatDate(list.createdAt)}</span>
                  <button
                    onClick={() => {
                      setSelectedListId(list.id || list._id || '');
                      setActiveTab('contacts');
                    }}
                    className="text-emerald-600 hover:text-emerald-700 font-medium inline-flex items-center gap-1"
                  >
                    <span>View contacts</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Spreadsheet Ingestion Wizard Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={handleResetImportModal}
        title="Spreadsheet Ingestion & Column Mapping"
        description="Ingest candidate contact records from CSV or Excel with automatic E.164 phone formatting and batch deduplication."
      >
        <div className="mt-4">
          {/* Wizard Step Indicator */}
          <div className="flex items-center justify-between mb-6 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  importStep === 1
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                1
              </span>
              <span className="text-xs font-medium text-slate-700">Upload File</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  importStep === 2
                    ? 'bg-emerald-600 text-white'
                    : importStep === 3
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                2
              </span>
              <span className="text-xs font-medium text-slate-700">Map Columns</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  importStep === 3
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                3
              </span>
              <span className="text-xs font-medium text-slate-700">Complete</span>
            </div>
          </div>

          {/* STEP 1: File Upload & Target List */}
          {importStep === 1 && (
            <div className="space-y-4">
              {uploadError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Drag & Drop File Box */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-8 text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-emerald-50/20"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center mx-auto mb-3">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                {selectedFile ? (
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{selectedFile.name}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {(selectedFile.size / 1024).toFixed(1)} KB ready for parsing
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Click to choose or drag spreadsheet here
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Supports .csv, .xlsx, .xls formats
                    </p>
                  </div>
                )}
              </div>

              {/* Ingestion Parameters */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Target List Name *"
                  placeholder="e.g. Campus Recruitment 2026"
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                />
                <Input
                  label="Default Country Code *"
                  placeholder="e.g. IN, US, GB"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-200">
                <Button variant="ghost" onClick={handleResetImportModal}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleUploadAndAnalyze}
                  isLoading={isUploading}
                  disabled={!selectedFile || !listName.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <span>Parse Headers & Preview</span>
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: Column Mapping & 5-Row Preview */}
          {importStep === 2 && previewData && (
            <div className="space-y-5">
              {uploadError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
                <span>
                  Detected <strong>{previewData.headers.length} columns</strong> and approximately{' '}
                  <strong>{previewData.rowCount} rows</strong>.
                </span>
                <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {previewData.fileName}
                </span>
              </div>

              {/* Column Mapping Selectors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50/70 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Phone Number Column <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={phoneColumn}
                    onChange={(e) => setPhoneColumn(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">-- Select Phone Column --</option>
                    {previewData.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    First Name Column (Optional)
                  </label>
                  <select
                    value={firstNameColumn}
                    onChange={(e) => setFirstNameColumn(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">-- None / Combine Name --</option>
                    {previewData.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Last Name Column (Optional)
                  </label>
                  <select
                    value={lastNameColumn}
                    onChange={(e) => setLastNameColumn(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">-- None --</option>
                    {previewData.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Email Column (Optional)
                  </label>
                  <select
                    value={emailColumn}
                    onChange={(e) => setEmailColumn(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">-- None --</option>
                    {previewData.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 5-Row Live Data Preview Table */}
              <div>
                <p className="text-xs font-semibold text-slate-800 mb-2">
                  First 5 Rows Preview:
                </p>
                <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-48 text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
                      <tr>
                        {previewData.headers.map((h) => (
                          <th key={h} className="py-2 px-3 border-b border-slate-200 whitespace-nowrap">
                            {h}
                            {h === phoneColumn && (
                              <span className="ml-1 text-[10px] text-emerald-600 font-bold uppercase">
                                [Phone]
                              </span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {previewData.previewRows.slice(0, 5).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          {previewData.headers.map((h) => (
                            <td key={h} className="py-2 px-3 whitespace-nowrap text-slate-600">
                              {String(row[h] !== undefined ? row[h] : '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Wizard Buttons */}
              <div className="pt-4 flex justify-between gap-3 border-t border-slate-200">
                <Button variant="outline" onClick={() => setImportStep(1)}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  onClick={handleConfirmImport}
                  isLoading={isUploading}
                  disabled={!phoneColumn}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Database className="w-4 h-4 mr-1.5" />
                  <span>Execute Ingestion & Deduplicate</span>
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: Summary Report */}
          {importStep === 3 && importResult && (
            <div className="space-y-5 text-center py-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-900">Ingestion Completed</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Target List: <strong className="text-slate-800">{importResult.listName}</strong>
                </p>
              </div>

              {/* Ingestion Statistics Box */}
              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-left">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Total Rows</span>
                  <p className="text-xl font-bold text-slate-900">{importResult.totalProcessed}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-600">Imported</span>
                  <p className="text-xl font-bold text-emerald-600">{importResult.imported}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">Duplicates Skipped</span>
                  <p className="text-xl font-bold text-slate-700">{importResult.duplicatesSkipped}</p>
                </div>
              </div>

              <div className="pt-4 flex justify-center">
                <Button
                  variant="primary"
                  onClick={handleResetImportModal}
                  className="bg-slate-900 hover:bg-slate-800 text-white px-6"
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
