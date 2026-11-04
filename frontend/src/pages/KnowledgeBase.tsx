import React, { useEffect, useState } from 'react';
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
  MessageSquare
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
  title: string;
  category: 'recruitment' | 'survey' | 'onboarding' | 'general';
  keywords: string[];
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const KnowledgeBase: React.FC = () => {
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'recruitment' | 'survey' | 'onboarding' | 'general'>('recruitment');
  const [keywords, setKeywords] = useState('');
  const [content, setContent] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // AI RAG Simulator Widget State
  const [testQuery, setTestQuery] = useState('');
  const [ragResult, setRagResult] = useState<{ matchedTitle: string; answer: string } | null>(null);
  const [isTestingQuery, setIsTestingQuery] = useState(false);

  useEffect(() => {
    loadArticles();
  }, []);

  const loadArticles = async () => {
    setIsLoading(true);
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
    } finally {
      setIsLoading(false);
    }
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
      setErrorMessage(err.response?.data?.message || err.message || 'Failed to save article.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteArticle = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this knowledge article?')) return;

    try {
      await api.delete(`/knowledge-base/${id}`);
      loadArticles();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete article.');
    }
  };

  // Test RAG Grounding matching
  const handleTestRetrieval = () => {
    if (!testQuery.trim()) return;
    setIsTestingQuery(true);

    setTimeout(() => {
      const lower = testQuery.toLowerCase();
      const matched = articles.find(
        (a) =>
          a.isActive &&
          (a.keywords.some((k) => lower.includes(k.toLowerCase())) ||
            a.title.toLowerCase().includes(lower) ||
            a.content.toLowerCase().includes(lower))
      );

      if (matched) {
        setRagResult({
          matchedTitle: matched.title,
          answer: `[Grounded Response based on "${matched.title}"]:\n${matched.content.slice(0, 180)}...`
        });
      } else {
        setRagResult({
          matchedTitle: 'No Direct Grounding Match',
          answer:
            'Confidence < 0.60. AI Agent triggers escalation to human operator queue under safe recruitment guardrails.'
        });
      }
      setIsTestingQuery(false);
    }, 600);
  };

  const filteredArticles = articles.filter((article) => {
    const matchesCategory =
      selectedCategory === 'all' || article.category === selectedCategory;
    const matchesSearch =
      !search ||
      article.title.toLowerCase().includes(search.toLowerCase()) ||
      article.keywords.some((k) => k.toLowerCase().includes(search.toLowerCase())) ||
      article.content.toLowerCase().includes(search.toLowerCase());

    return matchesCategory && matchesSearch;
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
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Source of truth for automated candidate FAQ answering, recruitment screening rules, and survey guidelines
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={loadArticles}
              className="gap-2"
              title="Refresh articles"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Refresh</span>
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

        {/* Search & Category Filter Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6">
          <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-lg border border-slate-300">
            {['all', 'recruitment', 'survey', 'general'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                  selectedCategory === cat
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat === 'all' ? `All (${articles.length})` : cat}
              </button>
            ))}
          </div>

          <div className="relative w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search title, keywords, content..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Articles List / Grid */}
        <div className="flex-1 p-8 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mb-2" />
              <p className="text-sm">Loading articles...</p>
            </div>
          ) : filteredArticles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <BookOpen className="w-10 h-10 stroke-[1.5] text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-600">No articles found</p>
              <p className="text-xs text-slate-400 mt-1">
                {search || selectedCategory !== 'all'
                  ? 'Try clearing the search query or category filters'
                  : 'Create your first grounded knowledge article'}
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
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            article.category === 'recruitment'
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
                <option value="recruitment">Recruitment</option>
                <option value="survey">Survey</option>
                <option value="onboarding">Onboarding</option>
                <option value="general">General</option>
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
