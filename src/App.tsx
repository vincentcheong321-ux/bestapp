/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Link2, Clock, Copy, Check, ExternalLink, AlertCircle, ShieldCheck, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const HARDCODED_URLS = [
  { name: 'Google', url: 'https://www.google.com' },
  { name: 'GitHub', url: 'https://github.com' },
  { name: 'AI Studio', url: 'https://aistudio.google.com' },
  { name: 'Tailwind CSS', url: 'https://tailwindcss.com' },
  { name: 'React', url: 'https://react.dev' },
  { name: '金调KTV APK', url: 'https://github.com/Archmage83/tvapk/blob/master/%E9%87%91%E8%B0%83KTV.apk' },
  { name: '金调KTV APK (Direct)', url: 'https://github.com/Archmage83/tvapk/raw/refs/heads/master/%E9%87%91%E8%B0%83KTV.apk' },
  { name: 'VINKTV APK', url: 'https://github.com/vincentcheong321-ux/bestapp/releases/download/vinktv/VINKTV.apk' },
];

const DURATIONS = [
  { label: '1 Minute', value: 1 },
  { label: '5 Minutes', value: 5 },
  { label: '1 Hour', value: 60 },
  { label: '1 Day', value: 1440 },
];

export default function App() {
  const [urls, setUrls] = useState<{ id?: number; name: string; url: string }[]>([]);
  const [newUrlName, setNewUrlName] = useState('');
  const [newUrlValue, setNewUrlValue] = useState('');
  const [selectedUrl, setSelectedUrl] = useState('');
  const [duration, setDuration] = useState(DURATIONS[1].value);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cloud APK Builder State
  const [githubToken, setGithubToken] = useState(localStorage.getItem('githubToken') || '');
  const [builderRepo, setBuilderRepo] = useState(localStorage.getItem('builderRepo') || '');
  const [targetRepo, setTargetRepo] = useState('');
  const [buildLoading, setBuildLoading] = useState(false);
  const [buildStatus, setBuildStatus] = useState<{type: 'success'|'error', message: string} | null>(null);

  useEffect(() => {
    localStorage.setItem('githubToken', githubToken);
  }, [githubToken]);

  useEffect(() => {
    localStorage.setItem('builderRepo', builderRepo);
  }, [builderRepo]);

  const handleBuildApk = async () => {
    if (!githubToken || !builderRepo || !targetRepo) {
      setBuildStatus({ type: 'error', message: 'Please fill in all fields' });
      return;
    }
    
    setBuildLoading(true);
    setBuildStatus(null);
    
    try {
      const response = await fetch(`https://api.github.com/repos/${builderRepo}/actions/workflows/build.yml/dispatches`, {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${githubToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            target_repo: targetRepo
          }
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to trigger build. Check your token and repo names.');
      }

      setBuildStatus({ 
        type: 'success', 
        message: 'Build triggered successfully! Check your GitHub Actions tab.' 
      });
    } catch (err: any) {
      setBuildStatus({ type: 'error', message: err.message || 'Something went wrong' });
    } finally {
      setBuildLoading(false);
    }
  };

  useEffect(() => {
    const fetchResources = async () => {
      try {
        const response = await fetch('/api/resources');
        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            setUrls(data);
            setSelectedUrl(data[0].url);
          } else {
            setUrls(HARDCODED_URLS);
            setSelectedUrl(HARDCODED_URLS[0].url);
          }
        }
      } catch (err) {
        console.error("Failed to fetch resources:", err);
        setUrls(HARDCODED_URLS);
        setSelectedUrl(HARDCODED_URLS[0].url);
      }
    };
    fetchResources();
  }, []);

  const addUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrlName || !newUrlValue) return;
    
    // Basic URL validation
    try {
      new URL(newUrlValue);
    } catch {
      setError('Please enter a valid URL (including http:// or https://)');
      return;
    }

    try {
      const response = await fetch('/api/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newUrlName, url: newUrlValue }),
      });

      if (response.ok) {
        const newEntry = await response.json();
        setUrls([newEntry, ...urls]);
        setNewUrlName('');
        setNewUrlValue('');
        setSelectedUrl(newEntry.url);
        setError(null);
      } else {
        throw new Error('Failed to add resource');
      }
    } catch (err) {
      console.error(err);
      setError('Failed to add resource to database.');
    }
  };

  const removeUrl = async (e: React.MouseEvent, urlToRemove: string, id?: number) => {
    e.stopPropagation();
    
    if (id) {
      try {
        await fetch(`/api/resources/${id}`, { method: 'DELETE' });
      } catch (err) {
        console.error("Failed to delete resource:", err);
      }
    }

    const updatedUrls = urls.filter(u => u.url !== urlToRemove);
    setUrls(updatedUrls);
    if (selectedUrl === urlToRemove) {
      setSelectedUrl(updatedUrls[0]?.url || '');
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setGeneratedUrl(null);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl: selectedUrl, durationMinutes: duration }),
      });

      if (!response.ok) throw new Error('Failed to generate link');

      const data = await response.json();
      setGeneratedUrl(data.expiringUrl);
      setExpiresAt(data.expiresAt);
    } catch (err) {
      setError('Something went wrong. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (generatedUrl) {
      navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-zinc-900 font-sans selection:bg-zinc-200">
      <div className="max-w-2xl mx-auto px-6 py-20">
        {/* Header */}
        <header className="mb-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white shadow-sm border border-black/5 mb-6">
            <ShieldCheck className="w-6 h-6 text-zinc-800" />
          </div>
          <h1 className="text-4xl font-medium tracking-tight mb-3">LinkVault</h1>
          <p className="text-zinc-500">Create secure, time-limited access to your resources.</p>
        </header>

        {/* Main Card */}
        <main className="bg-white rounded-[32px] p-8 shadow-sm border border-black/5">
          <div className="space-y-8">
            {/* URL Selection */}
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400 mb-4 px-1">
                Select Target Resource
              </label>
              <div className="grid grid-cols-1 gap-2 mb-4">
                {urls.map((item) => (
                  <div key={item.url} className="group relative">
                    <button
                      onClick={() => setSelectedUrl(item.url)}
                      className={cn(
                        "w-full flex items-center justify-between p-4 rounded-2xl border transition-all duration-200 text-left",
                        selectedUrl === item.url
                          ? "bg-zinc-900 border-zinc-900 text-white shadow-md"
                          : "bg-white border-black/5 text-zinc-600 hover:border-zinc-300"
                      )}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <Link2 className={cn("w-4 h-4 shrink-0", selectedUrl === item.url ? "text-zinc-400" : "text-zinc-300")} />
                        <span className="font-medium truncate">{item.name}</span>
                      </div>
                      <span className={cn("text-xs opacity-60 truncate ml-4 hidden sm:block max-w-[200px]", selectedUrl === item.url ? "text-zinc-300" : "text-zinc-400")}>
                        {item.url}
                      </span>
                    </button>
                    <button
                      onClick={(e) => removeUrl(e, item.url, item.id)}
                      className={cn(
                        "absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity",
                        selectedUrl === item.url ? "text-zinc-400 hover:text-white hover:bg-white/10" : "text-zinc-300 hover:text-red-500 hover:bg-red-50"
                      )}
                      title="Remove resource"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add New URL Form */}
              <form onSubmit={addUrl} className="bg-zinc-50 rounded-2xl p-4 border border-dashed border-zinc-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <input
                    type="text"
                    placeholder="Resource Name (e.g. My App)"
                    value={newUrlName}
                    onChange={(e) => setNewUrlName(e.target.value)}
                    className="bg-white border border-black/5 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200 transition-all"
                  />
                  <input
                    type="text"
                    placeholder="URL (https://...)"
                    value={newUrlValue}
                    onChange={(e) => setNewUrlValue(e.target.value)}
                    className="bg-white border border-black/5 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200 transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!newUrlName || !newUrlValue}
                  className="w-full py-2 bg-white border border-black/5 text-zinc-600 rounded-xl text-sm font-medium hover:bg-zinc-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add New Resource
                </button>
              </form>
            </div>

            {/* Expiration Selection */}
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400 mb-4 px-1">
                Expiration Duration
              </label>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDuration(d.value)}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-medium border transition-all duration-200",
                      duration === d.value
                        ? "bg-zinc-100 border-zinc-200 text-zinc-900"
                        : "bg-white border-black/5 text-zinc-500 hover:border-zinc-200"
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Clock className="w-4 h-4" />
                  Generate Expiring Link
                </>
              )}
            </button>

            {/* Error Message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-2xl text-sm border border-red-100"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Result Section */}
            <AnimatePresence>
              {generatedUrl && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-8 pt-8 border-t border-black/5 space-y-4"
                >
                  <div className="bg-zinc-50 rounded-2xl p-6 border border-black/5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-3">
                      Your Secure Link
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-white border border-black/5 rounded-xl px-4 py-3 text-sm font-mono text-zinc-600 truncate">
                        {generatedUrl}
                      </div>
                      <button
                        onClick={copyToClipboard}
                        className="p-3 bg-white border border-black/5 rounded-xl hover:bg-zinc-50 transition-colors text-zinc-600"
                        title="Copy to clipboard"
                      >
                        {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <a
                        href={generatedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3 bg-white border border-black/5 rounded-xl hover:bg-zinc-50 transition-colors text-zinc-600"
                        title="Open link"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                    
                    <div className="mt-4 flex items-center gap-2 text-xs text-zinc-400">
                      <Clock className="w-3 h-3" />
                      <span>Expires on {new Date(expiresAt!).toLocaleString()}</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {/* Build APK Section */}
            <div className="pt-8 border-t border-black/5">
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400 mb-4 px-1">
                Cloud APK Builder
              </label>
              <div className="bg-zinc-900 rounded-2xl p-6 text-white shadow-lg overflow-hidden relative">
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-white/10 rounded-xl">
                      <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Universal APK Compiler</h3>
                      <p className="text-xs text-zinc-400">Build any public React/Vue repo into an Android App</p>
                    </div>
                  </div>
                  
                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Your GitHub Token (Requires 'repo' scope)</label>
                      <input
                        type="password"
                        value={githubToken}
                        onChange={(e) => setGithubToken(e.target.value)}
                        placeholder="ghp_xxxxxxxxxxxx"
                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all text-white placeholder:text-zinc-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Your Builder Repo (Where build.yml lives)</label>
                      <input
                        type="text"
                        value={builderRepo}
                        onChange={(e) => setBuilderRepo(e.target.value)}
                        placeholder="your-username/your-repo"
                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all text-white placeholder:text-zinc-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Target Repo to Build (e.g., facebook/react)</label>
                      <input
                        type="text"
                        value={targetRepo}
                        onChange={(e) => setTargetRepo(e.target.value)}
                        placeholder="username/target-app"
                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all text-white placeholder:text-zinc-600"
                      />
                    </div>
                  </div>

                  <AnimatePresence>
                    {buildStatus && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={cn(
                          "mb-4 p-3 rounded-xl text-sm border",
                          buildStatus.type === 'success' 
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                            : "bg-red-500/10 text-red-400 border-red-500/20"
                        )}
                      >
                        {buildStatus.message}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    onClick={handleBuildApk}
                    disabled={buildLoading}
                    className="w-full py-3 bg-white text-zinc-900 rounded-xl font-bold text-sm hover:bg-zinc-100 transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {buildLoading ? (
                      <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" />
                    ) : (
                      <>
                        <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                        Trigger Remote Build
                      </>
                    )}
                  </button>
                  
                  <p className="mt-4 text-[10px] text-zinc-500 text-center">
                    Note: Your token is saved securely in your browser's local storage.
                  </p>
                </div>
                
                {/* Decorative background element */}
                <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl" />
              </div>
            </div>
          </div>
        </main>

        {/* Footer Info */}
        <footer className="mt-12 text-center text-xs text-zinc-400 space-y-2">
          <p>© 2026 LinkVault Security Systems</p>
          <p>Links are automatically purged from our servers after expiration.</p>
        </footer>
      </div>
    </div>
  );
}
