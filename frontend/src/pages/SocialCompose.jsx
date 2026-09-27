import { useState, useEffect } from 'react'
import SEO from '../components/SEO'

const API_BASE = '/api'

// Social tools are admin-only: send the admin session with every request.
const authHeaders = () => {
  const token = localStorage.getItem('auth_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const fetchJSON = (url, opts = {}) =>
  fetch(`${window.location.origin}${url}`, {
    ...opts,
    headers: { ...authHeaders(), ...(opts.headers || {}) },
  }).then(r => {
    if (!r.ok) return r.json().then(e => { throw new Error(e.detail || 'Request failed') })
    return r.json()
  })

const postJSON = (url, data) =>
  fetchJSON(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export default function SocialCompose() {
  const [text, setText] = useState('')
  const [hashtags, setHashtags] = useState([])
  const [availableHashtags, setAvailableHashtags] = useState([])
  const [hashtagCategory, setHashtagCategory] = useState('general')
  const [optimalTimes, setOptimalTimes] = useState([])
  const [drafts, setDrafts] = useState([])
  const [status, setStatus] = useState(null)
  const [preview, setPreview] = useState(null)
  const [imageData, setImageData] = useState(null)
  const [socialStatus, setSocialStatus] = useState(null)

  // Thread mode
  const [threadMode, setThreadMode] = useState(false)
  const [threadTweets, setThreadTweets] = useState([''])

  useEffect(() => {
    fetchJSON(`${API_BASE}/social/status`).then(setSocialStatus).catch(() => {})
    fetchJSON(`${API_BASE}/social/optimal-times?platform=twitter`).then(d => setOptimalTimes(d.times || [])).catch(() => {})
    fetchJSON(`${API_BASE}/social/drafts`).then(d => setDrafts(d.drafts || [])).catch(() => {})
    loadHashtags('general')
  }, [])

  const loadHashtags = (cat) => {
    setHashtagCategory(cat)
    fetchJSON(`${API_BASE}/social/hashtags?category=${cat}`).then(d => setAvailableHashtags(d.hashtags || [])).catch(() => {})
  }

  const toggleHashtag = (tag) => {
    setHashtags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  const handlePreview = async () => {
    try {
      const p = await postJSON(`${API_BASE}/social/compose/preview`, {
        text: threadMode ? threadTweets[0] : text,
        hashtags,
        image_data: imageData,
        platform: 'twitter',
      })
      setPreview(p)
    } catch (err) {
      setStatus('Preview failed: ' + err.message)
    }
  }

  const handleSaveDraft = async () => {
    try {
      await postJSON(`${API_BASE}/social/drafts`, {
        text: threadMode ? threadTweets.join('\n---\n') : text,
        hashtags,
        image_data: imageData,
        platform: 'twitter',
        status: 'draft',
      })
      setStatus('Draft saved!')
      fetchJSON(`${API_BASE}/social/drafts`).then(d => setDrafts(d.drafts || [])).catch(() => {})
      setTimeout(() => setStatus(null), 2000)
    } catch (err) {
      setStatus('Save failed: ' + err.message)
    }
  }

  const handlePost = async () => {
    try {
      setStatus('Posting...')
      if (threadMode) {
        const result = await postJSON(`${API_BASE}/social/post/thread`, {
          tweets: threadTweets.filter(t => t.trim()),
        })
        setStatus(result.success ? `Thread posted! ${result.tweet_count || threadTweets.length} tweets` : result.message)
      } else {
        const result = await postJSON(`${API_BASE}/social/post/twitter`, {
          text,
          hashtags,
          image_data: imageData,
          platform: 'twitter',
        })
        setStatus(result.success ? 'Posted!' : result.message)
      }
      setTimeout(() => setStatus(null), 4000)
    } catch (err) {
      setStatus('Post failed: ' + err.message)
      setTimeout(() => setStatus(null), 3000)
    }
  }

  const handleDeleteDraft = async (id) => {
    try {
      await fetch(`${window.location.origin}${API_BASE}/social/drafts/${id}`, { method: 'DELETE', headers: authHeaders() })
      setDrafts(prev => prev.filter(d => d.id !== id))
    } catch {}
  }

  const loadDraft = (draft) => {
    if (draft.text?.includes('\n---\n')) {
      setThreadMode(true)
      setThreadTweets(draft.text.split('\n---\n'))
    } else {
      setText(draft.text || '')
    }
    setHashtags(draft.hashtags || [])
  }

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImageData(reader.result)
    reader.readAsDataURL(file)
  }

  const addThreadTweet = () => setThreadTweets(prev => [...prev, ''])
  const updateThreadTweet = (idx, val) => setThreadTweets(prev => prev.map((t, i) => i === idx ? val : t))
  const removeThreadTweet = (idx) => setThreadTweets(prev => prev.filter((_, i) => i !== idx))

  const charCount = threadMode ? threadTweets[0]?.length || 0 : text.length
  const totalWithTags = charCount + (hashtags.length > 0 ? hashtags.join(' ').length + 1 : 0)

  return (
    <div className="space-y-6">
      <SEO
        title="Social Hub - Compose & Post"
        description="Compose and schedule IPL cricket social media posts with optimal timing, hashtag suggestions, thread mode, and draft management."
      />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-heading font-bold text-text-primary">Social Compose</h2>
          <p className="text-xs text-text-muted font-mono">
            Compose, preview, and post to Twitter/X
            {socialStatus?.twitter?.available && <span className="text-accent-lime ml-2">● Twitter Connected</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setThreadMode(false)}
            className={`px-4 py-2 text-xs rounded-lg border transition-colors ${!threadMode ? 'bg-accent-cyan/20 border-accent-cyan/40 text-accent-cyan' : 'border-border-subtle text-text-secondary'}`}
          >
            Single Tweet
          </button>
          <button
            onClick={() => setThreadMode(true)}
            className={`px-4 py-2 text-xs rounded-lg border transition-colors ${threadMode ? 'bg-accent-magenta/20 border-accent-magenta/40 text-accent-magenta' : 'border-border-subtle text-text-secondary'}`}
          >
            Thread
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">
        {/* Compose area */}
        <div className="space-y-4">
          {/* Text input */}
          <div className="bg-bg-card border border-border-subtle rounded-xl p-4">
            {threadMode ? (
              <div className="space-y-3">
                {threadTweets.map((tweet, idx) => (
                  <div key={idx} className="relative">
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent-magenta/30 rounded-full" />
                    <div className="pl-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono text-accent-magenta">{idx + 1}/{threadTweets.length}</span>
                        {idx > 0 && (
                          <button onClick={() => removeThreadTweet(idx)} className="text-[10px] text-text-muted hover:text-red-400">Remove</button>
                        )}
                      </div>
                      <textarea
                        value={tweet}
                        onChange={e => updateThreadTweet(idx, e.target.value)}
                        placeholder={idx === 0 ? "Hook tweet — grab attention!" : `Tweet ${idx + 1}...`}
                        rows={3}
                        className="w-full bg-bg-elevated border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-magenta/50 resize-none font-mono"
                      />
                      <div className="text-right">
                        <span className={`text-[10px] font-mono ${tweet.length > 280 ? 'text-red-400' : 'text-text-muted'}`}>
                          {tweet.length}/280
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={addThreadTweet} className="w-full py-2 text-xs font-mono text-accent-magenta border border-accent-magenta/20 rounded-lg hover:bg-accent-magenta/10 transition-colors">
                  + Add Tweet
                </button>
              </div>
            ) : (
              <>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="What's your cricket insight today? 🏏"
                  rows={5}
                  className="w-full bg-transparent text-text-primary text-sm placeholder:text-text-muted focus:outline-none resize-none font-mono"
                />
                <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
                  <span className={`text-xs font-mono ${totalWithTags > 280 ? 'text-red-400' : 'text-text-muted'}`}>
                    {totalWithTags}/280 characters
                  </span>
                  <div className="flex gap-2">
                    <label className="text-xs font-mono text-accent-cyan cursor-pointer hover:text-accent-cyan/80">
                      📎 Image
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </label>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Image preview */}
          {imageData && (
            <div className="relative">
              <img src={imageData} alt="Attached" className="w-full max-h-48 object-cover rounded-xl border border-border-subtle" />
              <button
                onClick={() => setImageData(null)}
                className="absolute top-2 right-2 w-6 h-6 bg-bg-primary/80 rounded-full text-text-muted hover:text-red-400 flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </div>
          )}

          {/* Hashtags */}
          <div className="bg-bg-card border border-border-subtle rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-mono text-text-muted">Hashtags</span>
              <div className="flex gap-1 ml-auto">
                {['general', 'batting', 'bowling', 'match', 'team'].map(cat => (
                  <button key={cat} onClick={() => loadHashtags(cat)}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono transition-colors ${
                      hashtagCategory === cat ? 'bg-accent-cyan/20 text-accent-cyan' : 'text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableHashtags.map(tag => (
                <button key={tag} onClick={() => toggleHashtag(tag)}
                  className={`text-xs px-2.5 py-1 rounded-full font-mono transition-all ${
                    hashtags.includes(tag)
                      ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40'
                      : 'bg-bg-elevated text-text-muted border border-border-subtle hover:text-text-secondary'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
            {hashtags.length > 0 && (
              <div className="mt-2 text-[10px] font-mono text-text-muted">
                Selected: {hashtags.join(' ')}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button onClick={handlePreview}
              className="flex-1 px-4 py-2.5 bg-bg-card border border-border-subtle rounded-lg text-sm font-mono text-text-secondary hover:text-text-primary transition-colors">
              👁 Preview
            </button>
            <button onClick={handleSaveDraft}
              className="flex-1 px-4 py-2.5 bg-bg-card border border-border-subtle rounded-lg text-sm font-mono text-text-secondary hover:text-text-primary transition-colors">
              💾 Save Draft
            </button>
            <button onClick={handlePost}
              className="flex-1 px-4 py-2.5 bg-accent-cyan/20 border border-accent-cyan/30 rounded-lg text-sm font-mono text-accent-cyan hover:bg-accent-cyan/30 transition-colors">
              🚀 Post Now
            </button>
          </div>

          {status && (
            <div className={`text-center text-xs font-mono py-2 px-4 rounded-lg ${
              status.includes('failed') || status.includes('Failed') ? 'bg-red-500/10 text-red-400' : 'bg-accent-cyan/10 text-accent-cyan'
            }`}>
              {status}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Preview card */}
          {preview && (
            <div className="bg-bg-card border border-border-subtle rounded-xl p-4">
              <h3 className="text-xs font-mono text-text-muted mb-3 uppercase tracking-wider">Tweet Preview</h3>
              <div className="bg-bg-elevated rounded-xl p-4 border border-border-subtle">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-accent-cyan/20 flex items-center justify-center text-xs font-bold text-accent-cyan">C</div>
                  <div>
                    <div className="text-sm font-bold text-text-primary">Crickrida</div>
                    <div className="text-[10px] text-text-muted font-mono">@Crickrida</div>
                  </div>
                </div>
                <p className="text-sm text-text-primary whitespace-pre-wrap">{preview.text}</p>
                {preview.has_image && (
                  <div className="mt-2 bg-bg-card rounded-lg h-32 flex items-center justify-center text-text-muted text-xs">
                    [Image attached]
                  </div>
                )}
                <div className="flex gap-4 mt-3 pt-2 border-t border-border-subtle">
                  <span className="text-[10px] text-text-muted">
                    {preview.remaining >= 0 ? `${preview.remaining} chars left` : `${Math.abs(preview.remaining)} over limit!`}
                  </span>
                  <span className={`text-[10px] ${preview.estimated_engagement === 'high' ? 'text-accent-lime' : 'text-text-muted'}`}>
                    Est. engagement: {preview.estimated_engagement}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Optimal posting times */}
          <div className="bg-bg-card border border-border-subtle rounded-xl p-4">
            <h3 className="text-xs font-mono text-text-muted mb-3 uppercase tracking-wider">Best Times to Post</h3>
            <div className="space-y-2">
              {optimalTimes.map((t, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <div>
                    <span className="text-sm text-text-primary font-mono">{t.time}</span>
                    <span className="text-[10px] text-text-muted ml-2">{t.label}</span>
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                    t.engagement === 'very high' ? 'bg-accent-lime/10 text-accent-lime' :
                    t.engagement === 'high' ? 'bg-accent-cyan/10 text-accent-cyan' :
                    'bg-bg-elevated text-text-muted'
                  }`}>
                    {t.engagement}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Drafts */}
          <div className="bg-bg-card border border-border-subtle rounded-xl p-4">
            <h3 className="text-xs font-mono text-text-muted mb-3 uppercase tracking-wider">
              Saved Drafts ({drafts.length})
            </h3>
            {drafts.length === 0 ? (
              <p className="text-xs text-text-muted">No drafts yet</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {drafts.slice(0, 10).map(d => (
                  <div key={d.id} className="bg-bg-elevated rounded-lg p-2.5 group">
                    <p className="text-xs text-text-secondary line-clamp-2">{d.text}</p>
                    <div className="flex justify-between items-center mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => loadDraft(d)} className="text-[10px] font-mono text-accent-cyan hover:underline">Load</button>
                      <button onClick={() => handleDeleteDraft(d.id)} className="text-[10px] font-mono text-red-400 hover:underline">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
