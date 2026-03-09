import { useRef, useState } from 'react';

export default function FileUploadPanel({ uploadedFile, onFileSelected }) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    onFileSelected(file);
  }

  return (
    <div className="space-y-4">
      <div
        className={`rounded-2xl border-2 border-dashed px-5 py-10 text-center transition ${
          isDragging
            ? 'border-[color:var(--brand)] bg-[color:var(--surface-soft)]'
            : 'border-[color:var(--line)] bg-white'
        }`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={handleDrop}
      >
        <div className="text-base font-semibold text-[color:var(--ink)]">
          Drag and drop a roster CSV
        </div>
        <div className="mt-2 text-sm text-[color:var(--muted)]">
          CSV is supported in this build. If your source file is XLSX, save it as CSV first.
        </div>
        <button
          className="mt-5 rounded-md bg-[color:var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[color:var(--brand-hover)]"
          type="button"
          onClick={() => inputRef.current?.click()}
        >
          Choose file
        </button>
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept=".csv"
          onChange={(event) => onFileSelected(event.target.files?.[0] ?? null)}
        />
      </div>

      {uploadedFile ? (
        <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-soft)] px-4 py-3 text-sm text-[color:var(--ink)]">
          Selected file: <strong>{uploadedFile.name}</strong>
        </div>
      ) : null}
    </div>
  );
}
