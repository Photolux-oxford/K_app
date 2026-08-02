import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Header } from '../components/Header';
import { api, apiPostForm } from '../lib/api';

interface UploadedFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  errorMsg?: string;
}

type PackageId = 'standard' | 'plus' | 'bundle';

const PACKAGES: {
  id: PackageId;
  label: string;
  range: string;
  min: number;
  max: number;
  price: number;
}[] = [
  { id: 'standard', label: 'Standard', range: '1–3 photos', min: 1, max: 3, price: 5 },
  { id: 'plus', label: 'Plus', range: '4–10 photos', min: 4, max: 10, price: 10 },
  { id: 'bundle', label: 'Bundle', range: '11–20 photos', min: 11, max: 20, price: 15 },
];

const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.cr2', '.nef', '.arw'];
const MAX_SIZE_MB = 25;
const FONT = "'Helvetica Neue', Arial, sans-serif";

function getExt(name: string) {
  return name.slice(name.lastIndexOf('.')).toLowerCase();
}

function validateFile(file: File): string | null {
  if (!ALLOWED_EXTS.includes(getExt(file.name))) {
    return `${file.name}: file type not allowed (accepted: JPG, PNG, TIFF, RAW)`;
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return `${file.name}: exceeds ${MAX_SIZE_MB} MB limit`;
  }
  return null;
}

function packageForCount(count: number): PackageId | null {
  const match = PACKAGES.find(p => count >= p.min && count <= p.max);
  return match ? match.id : null;
}

export function EditingPage() {
  const [styleNotes, setStyleNotes] = useState('');
  const [selectedPackage, setSelectedPackage] = useState<PackageId>('standard');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const activePackage = PACKAGES.find(p => p.id === selectedPackage)!;
  const countMatches =
    files.length >= activePackage.min && files.length <= activePackage.max;

  useEffect(() => {
    const match = packageForCount(files.length);
    if (match && match !== selectedPackage) {
      setSelectedPackage(match);
    }
  }, [files.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function addFiles(newFiles: FileList | File[]) {
    const additions: UploadedFile[] = [];
    for (const f of Array.from(newFiles)) {
      const err = validateFile(f);
      if (err) { toast.error(err); continue; }
      if (files.some(u => u.file.name === f.name && u.file.size === f.size)) continue;
      additions.push({ id: crypto.randomUUID(), file: f, status: 'pending', progress: 0 });
    }
    setFiles(prev => {
      const next = [...prev, ...additions];
      if (next.length > 20) {
        toast.error('Maximum 20 photos per request.');
        return next.slice(0, 20);
      }
      return next;
    });
  }

  function removeFile(id: string) {
    setFiles(prev => prev.filter(f => f.id !== id));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  }

  const canSubmit =
    styleNotes.trim().length > 0 &&
    files.length > 0 &&
    countMatches &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (files.length > 20) {
      toast.error('Maximum 20 photos per request.');
      return;
    }
    setSubmitting(true);

    try {
      const { id } = await api.post<{ id: number; status: string }>(
        '/editing-requests/',
        { style_notes: styleNotes.trim(), package: selectedPackage }
      );

      let anyFailed = false;
      for (let i = 0; i < files.length; i++) {
        const fileId = files[i].id;
        setFiles(prev => prev.map(f =>
          f.id === fileId ? { ...f, status: 'uploading', progress: 50 } : f
        ));
        try {
          const formData = new FormData();
          formData.append('file', files[i].file);
          await apiPostForm(`/editing-requests/${id}/files/`, formData);
          setFiles(prev => prev.map(f =>
            f.id === fileId ? { ...f, status: 'done', progress: 100 } : f
          ));
        } catch {
          anyFailed = true;
          setFiles(prev => prev.map(f =>
            f.id === fileId ? { ...f, status: 'error', progress: 0, errorMsg: 'Upload failed' } : f
          ));
        }
      }

      if (anyFailed) {
        toast.error('Some files failed to upload. Please retry the failed files or submit without them.');
        setSubmitting(false);
        return;
      }

      const checkout = await api.post<{
        id: number;
        status: string;
        payment: { payment_link_url: string | null; amount: string } | null;
      }>(`/editing-requests/${id}/checkout/`, {});

      const payUrl = checkout.payment?.payment_link_url;
      if (payUrl) {
        toast.success('Redirecting to secure payment…');
        window.location.href = payUrl;
        return;
      }

      toast.success('Request submitted. Complete payment from your dashboard.');
      navigate('/dashboard');
    } catch (err: unknown) {
      const apiErr = err as { data?: { error?: string } };
      const message = apiErr?.data?.error || 'Failed to submit request. Please try again.';
      toast.error(message);
      setSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '10px 12px',
    border: '1px solid rgba(0,0,0,0.12)',
    fontFamily: FONT,
    fontSize: 13, color: '#111', outline: 'none',
    boxSizing: 'border-box' as const,
  };
  const labelStyle = {
    fontSize: 10, fontWeight: 600 as const, letterSpacing: '0.1em',
    textTransform: 'uppercase' as const, color: '#888',
    display: 'block' as const, marginBottom: 6,
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#fafafa',
      fontFamily: FONT,
      paddingTop: 80,
    }}>
      <Header />
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px' }}>

        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#aaa', margin: '0 0 8px' }}>
            Photo Editing
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 300, color: '#111', margin: 0, letterSpacing: '-0.01em' }}>
            Submit photos for editing
          </h1>
        </div>

        <div className="editing-layout" style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>

          <div style={{ flex: '1 1 480px', background: '#fff', border: '1px solid rgba(0,0,0,0.06)', padding: '28px 28px 24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              <div>
                <label style={labelStyle}>Choose a package</label>
                <div className="editing-packages" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {PACKAGES.map(pkg => {
                    const selected = selectedPackage === pkg.id;
                    return (
                      <button
                        key={pkg.id}
                        type="button"
                        onClick={() => setSelectedPackage(pkg.id)}
                        style={{
                          textAlign: 'left',
                          padding: '12px 12px',
                          border: selected ? '1.5px solid #111' : '1px solid rgba(0,0,0,0.12)',
                          background: selected ? '#fafafa' : '#fff',
                          cursor: 'pointer',
                          fontFamily: FONT,
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#111' }}>
                          {pkg.label}
                        </div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{pkg.range}</div>
                        <div style={{ fontSize: 16, fontWeight: 500, color: '#111', marginTop: 8 }}>£{pkg.price}</div>
                      </button>
                    );
                  })}
                </div>
                {files.length > 0 && !countMatches && (
                  <p style={{ fontSize: 11, color: '#b91c1c', margin: '8px 0 0' }}>
                    {files.length > 20
                      ? 'Maximum 20 photos. Please remove some files.'
                      : `Selected package needs ${activePackage.min}–${activePackage.max} photos (you have ${files.length}).`}
                  </p>
                )}
              </div>

              <div>
                <label style={labelStyle}>Editing Style & Instructions</label>
                <textarea
                  value={styleNotes}
                  onChange={e => setStyleNotes(e.target.value)}
                  placeholder="Describe the look you're after — e.g. warm tones, black & white, natural light, remove blemishes…"
                  maxLength={2000}
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              <div style={{
                background: '#fafafa',
                border: '1px solid rgba(0,0,0,0.08)',
                padding: '14px 16px',
                fontSize: 12,
                color: '#555',
                lineHeight: 1.6,
              }}>
                <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888' }}>
                  Delivery policy
                </p>
                <p style={{ margin: 0 }}>
                  Edited photos are returned by email within a maximum of one week.
                  If delivery takes longer, you are eligible for compensation.
                  Photo editing does not book a calendar session slot.
                </p>
              </div>

              <div>
                <label style={labelStyle}>Upload Photos</label>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragOver ? '#111' : '#d1d5db'}`,
                    borderRadius: 4, padding: '28px 16px', textAlign: 'center',
                    background: dragOver ? '#f9f9f9' : '#fafafa',
                    cursor: 'pointer', marginBottom: 12,
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 6 }}>📁</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#555' }}>Drag & drop photos here</div>
                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>or click to browse</div>
                  <div style={{ fontSize: 10, color: '#bbb', marginTop: 6 }}>
                    JPG, PNG, TIFF, RAW · Max {MAX_SIZE_MB} MB per file · Max 20 photos
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ALLOWED_EXTS.join(',')}
                  style={{ display: 'none' }}
                  onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
                />

                {files.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {files.map((uf) => (
                      <div key={uf.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '7px 10px',
                        background: uf.status === 'error' ? '#fef2f2' : uf.status === 'done' ? '#f0fdf4' : '#fff',
                        border: `1px solid ${uf.status === 'error' ? '#fca5a5' : uf.status === 'done' ? '#bbf7d0' : '#e5e7eb'}`,
                        borderRadius: 3, fontSize: 11,
                      }}>
                        <span style={{ color: uf.status === 'error' ? '#dc2626' : '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                          📷 {uf.file.name}
                          <span style={{ color: '#aaa', marginLeft: 6 }}>· {(uf.file.size / 1024 / 1024).toFixed(1)} MB</span>
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          {uf.status === 'uploading' && (
                            <div style={{ width: 60, height: 3, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${uf.progress}%`, height: '100%', background: '#111', transition: 'width 0.3s' }} />
                            </div>
                          )}
                          {uf.status === 'done' && <span style={{ color: '#22c55e', fontSize: 12 }}>✓</span>}
                          {uf.status === 'error' && <span style={{ color: '#ef4444', fontSize: 11 }}>{uf.errorMsg}</span>}
                          {uf.status !== 'uploading' && uf.status !== 'done' && (
                            <button onClick={() => removeFile(uf.id)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}>✕</button>
                          )}
                        </div>
                      </div>
                    ))}
                    <p style={{ fontSize: 11, color: '#aaa', margin: '6px 0 0' }}>
                      {files.length} file{files.length !== 1 ? 's' : ''} selected
                      {countMatches ? ` · £${activePackage.price}` : ''}
                    </p>
                  </div>
                )}
              </div>

            </div>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                width: '100%', padding: '12px 0', marginTop: 24,
                background: canSubmit ? '#111' : '#e5e7eb',
                color: canSubmit ? '#fff' : '#aaa',
                border: 'none', cursor: canSubmit ? 'pointer' : 'not-allowed',
                fontFamily: FONT,
                fontSize: 12, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase',
                transition: 'background 0.2s',
              }}
            >
              {submitting
                ? 'Submitting…'
                : countMatches
                  ? `Pay £${activePackage.price} & submit`
                  : 'Submit Editing Request'}
            </button>
          </div>

          <div className="editing-rail" style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', padding: '20px 20px 18px' }}>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#888', margin: '0 0 14px' }}>What happens next</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  'Choose a package and upload your photos',
                  'Pay securely at submit — no calendar slot needed',
                  'Photolux Oxford edits your photos to your brief',
                  'Edited photos returned by email within one week',
                ].map((text, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ width: 18, height: 18, background: '#111', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 12, color: '#555', lineHeight: 1.5 }}>{text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', padding: '18px 20px', fontSize: 11, color: '#777', lineHeight: 1.6 }}>
              Packages: 1–3 photos £5 · 4–10 photos £10 · 11–20 photos £15.
              If delivery takes longer than one week, you are eligible for compensation.
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
