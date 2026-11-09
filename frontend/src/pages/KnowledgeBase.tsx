import React, { useEffect, useState, useRef } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  Filter,
  FileText,
  Tag,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Trash2,
  Cpu,
  RefreshCw,
  FolderTree,
  Send,
  MessageSquare,
  UploadCloud,
  FileUp,
  File,
  Folder,
  Layers,
  X,
  Sparkles
} from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { formatDate } from '../lib/utils';

interface KnowledgeArticle {
  id?: string;
  _id?: string;
  collectionId?: string;
  sourceFileName?: string;
  title: string;
  category: 'sales' | 'survey' | 'support' | 'recruitment' | 'onboarding' | 'general';
  keywords: string[];
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface KnowledgeCollection {
  id: string;
  _id: string;
  name: string;
  description?: string;
  category: 'sales' | 'survey' | 'support' | 'recruitment' | 'onboarding' | 'general';
  sourceFileName?: string;
  articlesCount: number;
  isActive: boolean;
  createdAt: string;
}

export const KnowledgeBase: React.FC = () => {
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [collections, setCollections] = useState<KnowledgeCollection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeView, setActiveView] = useState<'articles' | 'collections'>('articles');
  const [selectedCollectionFilter, setSelectedCollectionFilter] = useState<string>('all');

  // Article Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'sales' | 'survey' | 'support' | 'recruitment' | 'onboarding' | 'general'>('general');
  const [keywords, setKeywords] = useState('');
  const [content, setContent] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // PDF Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);
  const [uploadCollectionName, setUploadCollectionName] = useState('');
  const [uploadCategory, setUploadCategory] = useState<'sales' | 'survey' | 'support' | 'recruitment' | 'onboarding' | 'general'>('general');
  const [uploadDescription, setUploadDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI RAG Simulator Widget State
  const [testQuery, setTestQuery] = useState('');
  const [ragResult, setRagResult] = useState<{ matchedTitle: string; answer: string } | null>(null);
  const [isTestingQuery, setIsTestingQuery] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadArticles = async () => {
    try {
      const res = await api.get<any[]>('/knowledge-base');
      if (res.success && res.data) {
        const normalized: KnowledgeArticle[] = (res.data || []).map((art: any) => ({
          ...art,
          id: art.id || art._id || '',
          _id: art.id || art._id || '',
          keywords: Array.isArray(art.keywords) ? art.keywords : [],
        }));
        setArticles(normalized);
      }
    } catch (err) {
      console.error('Failed to load knowledge articles:', err);
    }
  };

  const loadCollections = async () => {
    try {
      const res = await api.get<any[]>('/knowledge-base/collections');
      if (res.success && res.data) {
        const normalized: KnowledgeCollection[] = (res.data || []).map((c: any) => ({
          ...c,
          id: c.id || c._id || '',
          _id: c.id || c._id || ''
        }));
        setCollections(normalized);
      }
    } catch (err) {
      console.error('Failed to load collections:', err);
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    await Promise.all([loadArticles(), loadCollections()]);
    setIsLoading(false);
  };

  const handleOpenCreateModal = () => {
    setEditingId(null);
    setTitle('');
    setCategory('recruitment');
    setKeywords('');
    setContent('');
    setIsActive(true);
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (article: KnowledgeArticle) => {
    setEditingId(article.id || article._id || '');
    setTitle(article.title);
    setCategory(article.category);
    setKeywords((article.keywords || []).join(', '));
    setContent(article.content);
    setIsActive(article.isActive);
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const handleOpenUploadModal = () => {
    setSelectedPdfFile(null);
    setUploadCollectionName('');
    setUploadCategory('recruitment');
    setUploadDescription('');
    setUploadError(null);
    setUploadSuccessMessage(null);
    setIsUploadModalOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setUploadError('Only PDF documents are supported (.pdf)');
        return;
      }
      setSelectedPdfFile(file);
      setUploadError(null);
      if (!uploadCollectionName) {
        const cleanName = file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
        setUploadCollectionName(cleanName);
      }
    }
  };

  const handleUploadPdf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPdfFile) {
      setUploadError('Please choose a PDF document to upload');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccessMessage(null);

    try {
      const formData = new FormData();
      formData.append('pdf', selectedPdfFile);
      formData.append('name', uploadCollectionName.trim() || selectedPdfFile.name.replace(/\.pdf$/i, ''));
      formData.append('category', uploadCategory);
      if (uploadDescription.trim()) {
        formData.append('description', uploadDescription.trim());
      }

      const res = await api.post('/knowledge-base/upload-pdf', formData);
      if (res.success) {
        setUploadSuccessMessage(res.message || 'PDF successfully ingested into Knowledge Base!');
        await loadData();
        setTimeout(() => {
          setIsUploadModalOpen(false);
          setSelectedPdfFile(null);
          setUploadCollectionName('');
          setUploadDescription('');
          setUploadSuccessMessage(null);
          setActiveView('collections');
        }, 1200);
      } else {
        setUploadError(res.message || 'Failed to upload and ingest PDF');
      }
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed. Ensure PDF is text-readable.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteCollection = async (collId: string, collName: string) => {
    if (!window.confirm(`Are you sure you want to delete the collection "${collName}" and all its ingested knowledge articles? This cannot be undone.`)) {
      return;
    }
    try {
      await api.request(`/knowledge-base/collections/${collId}`, { method: 'DELETE' });
      await loadData();
      if (selectedCollectionFilter === collId) {
        setSelectedCollectionFilter('all');
      }
    } catch (err: any) {
      alert(`Failed to delete collection: ${err.message}`);
    }
  };

  const handleSaveArticle = async () => {
    if (!title.trim() || !content.trim()) {
      setErrorMessage('Title and content are required.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const parsedKeywords = keywords
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    try {
      if (editingId) {
        await api.put(`/knowledge-base/${editingId}`, {
          title: title.trim(),
          category,
          keywords: parsedKeywords,
          content: content.trim(),
          isActive
        });
      } else {
        await api.post('/knowledge-base', {
          title: title.trim(),
          category,
          keywords: parsedKeywords,
          content: content.trim(),
          isActive
        });
      }

      setIsModalOpen(false);
      loadArticles();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save knowledge article');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteArticle = async (id: string) => {
    if (!confirm('Are you sure you want to delete this knowledge article?')) return;
    try {
      await api.request(`/knowledge-base/${id}`, { method: 'DELETE' });
      loadArticles();
    } catch (err) {
      console.error('Failed to delete article:', err);
    }
  };

  const handleTestRetrieval = async () => {
    if (!testQuery.trim() || isTestingQuery) return;
    setIsTestingQuery(true);
    setRagResult(null);

    try {
      // Look up candidate query against articles
      const matches = articles.filter(
        (art) =>
          art.isActive &&
          (art.title.toLowerCase().includes(testQuery.toLowerCase()) ||
            art.content.toLowerCase().includes(testQuery.toLowerCase()) ||
            art.keywords.some((kw) => testQuery.toLowerCase().includes(kw.toLowerCase())))
      );

      if (matches.length > 0) {
        setRagResult({
          matchedTitle: matches[0].title,
          answer: `[Grounded Fact Match]:\n${matches[0].content}`
        });
      } else {
        setRagResult({
          matchedTitle: 'No Direct KB Match',
          answer:
            'No high-confidence knowledge article found. The AI Agent will invoke the request_human_assistance tool or fallback safely.'
        });
      }
    } catch (err) {
      console.error('Error during test query:', err);
    } finally {
      setIsTestingQuery(false);
    }
  };

  const filteredArticles = articles.filter((art) => {
    const matchesCategory = selectedCategory === 'all' || art.category === selectedCategory;
    const matchesCollection = selectedCollectionFilter === 'all' || art.collectionId === selectedCollectionFilter;
    const matchesSearch =
      !search.trim() ||
      art.title.toLowerCase().includes(search.toLowerCase()) ||
      art.content.toLowerCase().includes(search.toLowerCase()) ||
      art.keywords.some((kw) => kw.toLowerCase().includes(search.toLowerCase()));

    return matchesCategory && matchesCollection && matchesSearch;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Header */}
      <header className="px-8 py-6 bg-white border-b border-slate-200 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Knowledge Base & Grounding RAG
              </h1>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                {articles.length} articles
              </span>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                {collections.length} collections
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Source of truth for campaign JDs, automated candidate FAQ answering, and screening guidelines
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              className="gap-2"
              title="Refresh articles and collections"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Refresh</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenUploadModal}
              className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 bg-emerald-50/40"
            >
              <UploadCloud className="w-4 h-4 text-emerald-600" />
              <span>Upload PDF / JD</span>
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenCreateModal}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Create Article</span>
            </Button>
          </div>
        </div>

        {/* View Switcher: Articles vs Collections */}
        <div className="flex items-center gap-2 mt-5 border-b border-slate-100 pb-3">
          <button
            onClick={() => {
              setActiveView('articles');
              setSelectedCollectionFilter('all');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeView === 'articles'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>All Articles ({articles.length})</span>
          </button>

          <button
            onClick={() => setActiveView('collections')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeView === 'collections'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>Job Descriptions & Collections ({collections.length})</span>
          </button>
        </div>

        {/* Search & Category Filter Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-lg border border-slate-300">
              {['all', 'sales', 'survey', 'support', 'recruitment', 'general'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                    selectedCategory === cat
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat === 'all' ? `All` : cat}
                </button>
              ))}
            </div>

            {selectedCollectionFilter !== 'all' && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-medium border border-emerald-200">
                <span>Collection: {collections.find((c) => c.id === selectedCollectionFilter)?.name || 'Filtered'}</span>
                <button
                  onClick={() => setSelectedCollectionFilter('all')}
                  className="hover:text-emerald-950 p-0.5"
                  title="Clear collection filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          <div className="relative w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={activeView === 'collections' ? "Search collections..." : "Search title, keywords, content..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Articles or Collections List */}
        <div className="flex-1 p-8 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mb-2" />
              <p className="text-sm">Loading knowledge data...</p>
            </div>
          ) : activeView === 'collections' ? (
            /* COLLECTIONS VIEW */
            collections.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <Folder className="w-10 h-10 stroke-[1.5] text-slate-300 mb-2" />
                <p className="text-sm font-medium text-slate-600">No Knowledge Collections found</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm text-center">
                  Upload a Job Description or company handbook PDF to automatically create your first collection.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleOpenUploadModal}
                  className="mt-4 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>Upload Job Description PDF</span>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {collections
                  .filter((c) =>
                    !search.trim() ||
                    c.name.toLowerCase().includes(search.toLowerCase()) ||
                    (c.description || '').toLowerCase().includes(search.toLowerCase())
                  )
                  .map((collection) => (
                    <Card
                      key={collection.id || collection._id}
                      className="p-5 border-slate-200 bg-white shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="indigo" className="capitalize text-[10px]">
                              {collection.category}
                            </Badge>
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-semibold">
                              <Sparkles className="w-3 h-3 text-emerald-600" />
                              {collection.articlesCount} Articles
                            </span>
                          </div>

                          <button
                            onClick={() => handleDeleteCollection(collection.id || collection._id, collection.name)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Delete collection and all articles"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <h3 className="font-bold text-slate-900 text-sm mt-3 flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>{collection.name}</span>
                        </h3>
                        {collection.description && (
                          <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">
                            {collection.description}
                          </p>
                        )}

                        {collection.sourceFileName && (
                          <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-mono text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                            <File className="w-3 h-3 text-slate-400" />
                            <span className="truncate max-w-[200px]">{collection.sourceFileName}</span>
                          </div>
                        )}
                      </div>

                      <div className="pt-3 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="text-[10px] text-slate-400">Created {formatDate(collection.createdAt)}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-emerald-700 hover:bg-emerald-50 font-semibold px-2.5"
                          onClick={() => {
                            setSelectedCollectionFilter(collection.id || collection._id);
                            setActiveView('articles');
                          }}
                        >
                          View {collection.articlesCount} Articles →
                        </Button>
                      </div>
                    </Card>
                  ))}
              </div>
            )
          ) : (
            /* ARTICLES VIEW */
            filteredArticles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <BookOpen className="w-10 h-10 stroke-[1.5] text-slate-300 mb-2" />
                <p className="text-sm font-medium text-slate-600">No articles found</p>
                <p className="text-xs text-slate-400 mt-1">
                  {search || selectedCategory !== 'all' || selectedCollectionFilter !== 'all'
                    ? 'Try clearing the search query or collection filter'
                    : 'Create your first grounded knowledge article or upload a JD PDF'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredArticles.map((article) => (
                  <Card
                    key={article.id || article._id}
                    className="p-5 border-slate-200 bg-white shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant={
                              article.category === 'sales'
                                ? 'amber'
                                : article.category === 'support'
                                ? 'sky'
                                : article.category === 'recruitment'
                                ? 'indigo'
                                : article.category === 'survey'
                                ? 'emerald'
                                : 'slate'
                            }
                            className="capitalize text-[10px]"
                          >
                            {article.category}
                          </Badge>
                          {article.isActive ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Live
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                              Disabled
                            </span>
                          )}

                          {article.sourceFileName && (
                            <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 truncate max-w-[130px]" title={article.sourceFileName}>
                              📄 {article.sourceFileName}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEditModal(article)}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            title="Edit article"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteArticle(article.id || article._id || '')}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Delete article"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <h3 className="font-bold text-slate-900 text-sm mt-3">{article.title}</h3>
                      <p className="text-xs text-slate-600 mt-2 line-clamp-3 leading-relaxed">
                        {article.content}
                      </p>

                      {/* Keywords Chips */}
                      {article.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {article.keywords.map((kw, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] border border-slate-200"
                            >
                              <Tag className="w-2.5 h-2.5 text-slate-400" />
                              <span>{kw}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-3 mt-4 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between">
                      <span>Updated {formatDate(article.updatedAt)}</span>
                      <span className="font-mono text-slate-400">{(article.id || article._id || '').slice(-6)}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )
          )}
        </div>

        {/* AI RAG Retrieval Sandbox Widget */}
        <aside className="w-full lg:w-96 bg-white border-t lg:border-t-0 lg:border-l border-slate-200 p-6 flex flex-col justify-between shrink-0 overflow-y-auto">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                <Cpu className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">AI Grounding Simulator</h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Test how candidate WhatsApp queries are matched against your knowledge base in real time.
            </p>

            <div className="mt-5 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Candidate WhatsApp Query
                </label>
                <textarea
                  rows={3}
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  placeholder="e.g. What are the working hours and is this role remote?"
                  className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 resize-none"
                />
              </div>

              <Button
                variant="primary"
                size="sm"
                onClick={handleTestRetrieval}
                isLoading={isTestingQuery}
                disabled={!testQuery.trim()}
                className="w-full justify-center bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />
                <span>Simulate AI Retrieval</span>
              </Button>
            </div>

            {/* Retrieval Result */}
            {ragResult && (
              <div className="mt-5 p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Retrieval Output
                  </span>
                  <Badge variant="indigo" className="text-[10px]">
                    {ragResult.matchedTitle}
                  </Badge>
                </div>
                <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-sans">
                  {ragResult.answer}
                </p>
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-slate-200 mt-6 text-xs text-slate-400">
            <p className="font-semibold text-slate-600 mb-1">Architectural Safeguards:</p>
            <p>Knowledge articles are automatically injected into Gemini system prompts with strict grounding tags.</p>
          </div>
        </aside>
      </div>

      {/* Upload PDF / Document Modal */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => !isUploading && setIsUploadModalOpen(false)}
        title="Upload Job Description or Policy Document"
        description="FlowDesk extracts factual knowledge sections, duties, and compensation details automatically using Gemini AI."
      >
        <form onSubmit={handleUploadPdf} className="space-y-4 mt-4">
          {uploadError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {uploadSuccessMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{uploadSuccessMessage}</span>
            </div>
          )}

          {/* Drag & Drop Area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              selectedPdfFile
                ? 'border-emerald-500 bg-emerald-50/30'
                : 'border-slate-300 hover:border-emerald-400 bg-slate-50/50'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            {selectedPdfFile ? (
              <div className="space-y-1.5">
                <FileText className="w-10 h-10 mx-auto text-emerald-600" />
                <p className="text-xs font-semibold text-slate-900">{selectedPdfFile.name}</p>
                <p className="text-[11px] text-slate-500">{(selectedPdfFile.size / 1024).toFixed(1)} KB • Ready to Ingest</p>
                <span className="text-[10px] text-emerald-700 underline font-medium">Click to select different file</span>
              </div>
            ) : (
              <div className="space-y-1.5">
                <UploadCloud className="w-10 h-10 mx-auto text-slate-400" />
                <p className="text-xs font-semibold text-slate-700">Click to choose a Job Description or Policy PDF</p>
                <p className="text-[11px] text-slate-400">Supported format: .pdf (up to 15 MB)</p>
              </div>
            )}
          </div>

          <Input
            label="Collection Name (Role Title or Document Name) *"
            placeholder="e.g. Senior Full-Stack Engineer JD"
            value={uploadCollectionName}
            onChange={(e) => setUploadCollectionName(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Category *
              </label>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="sales">Sales & Product Deck</option>
                <option value="survey">Survey & Feedback Guidelines</option>
                <option value="support">Customer Support FAQ</option>
                <option value="recruitment">Recruitment (Role Details)</option>
                <option value="onboarding">Onboarding Policy</option>
                <option value="general">General Company Policy</option>
              </select>
            </div>

            <div>
              <Input
                label="Description (Optional)"
                placeholder="e.g. Remote role, Bangalore office"
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-200">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsUploadModalOpen(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isUploading}
              disabled={!selectedPdfFile || isUploading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isUploading ? 'Parsing with AI...' : 'Upload & Ingest with AI'}</span>
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create / Edit Article Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Knowledge Article' : 'Create Knowledge Article'}
        description="Add factual company guidelines, job details, or survey submission rules for the conversational assistant."
      >
        <div className="space-y-4 mt-4">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <Input
            label="Article Title *"
            placeholder="e.g. Full Stack Developer - Working Hours & Location"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="sales">Sales & Product Guide</option>
                <option value="survey">Survey & Feedback Guidelines</option>
                <option value="support">Customer Support FAQ</option>
                <option value="recruitment">Recruitment (Role Details)</option>
                <option value="onboarding">Onboarding Policy</option>
                <option value="general">General Guidelines</option>
              </select>
            </div>

            <div>
              <Input
                label="Keywords (comma-separated)"
                placeholder="hours, remote, shift, timing"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Article Content (Factual Grounding Source) *
            </label>
            <textarea
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="State the exact facts. E.g. Working hours are Monday to Friday, 9:30 AM to 6:30 PM IST. This role is full-time remote for candidates based in India..."
              className="w-full p-3 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 resize-none leading-relaxed"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActiveArticle"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="isActiveArticle" className="text-xs font-medium text-slate-700">
              Active in AI conversational context
            </label>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-200">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveArticle}
              isLoading={isSaving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <span>{editingId ? 'Save Changes' : 'Publish Article'}</span>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
