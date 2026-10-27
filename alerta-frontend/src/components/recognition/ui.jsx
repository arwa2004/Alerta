export function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 bg-[#0B1F3A]/50 backdrop-blur-xs flex items-start justify-center p-4 z-50 overflow-y-auto">
      <div className={`bg-white rounded-3xl border border-[#D8DEE4] shadow-2xl w-full my-8 ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className="flex items-center justify-between px-7 pt-6 pb-4 border-b border-[#E7EBEF]">
          <h3 className="text-lg font-bold text-[#0B1F3A]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 rounded-lg text-[#8FA3B8] hover:bg-gray-100 hover:text-[#0B1F3A] cursor-pointer"
          >
            ✕
          </button>
        </div>
        <div className="px-7 py-6">{children}</div>
      </div>
    </div>
  );
}

export function Banner({ type = 'error', children }) {
  if (!children) return null;
  const cls =
    type === 'success'
      ? 'bg-[#2BB673]/12 text-[#1D8A57] border-[#2BB673]/30'
      : 'bg-red-50 text-[#C22B36] border-red-200';
  return (
    <div role={type === 'error' ? 'alert' : 'status'} className={`p-3.5 rounded-xl text-xs font-semibold border whitespace-pre-line ${cls}`}>
      {children}
    </div>
  );
}

export function EmptyState({ title, hint, action }) {
  return (
    <div className="bg-white rounded-3xl border border-dashed border-[#D8DEE4] p-12 text-center">
      <p className="text-base font-bold text-[#0B1F3A]">{title}</p>
      <p className="text-sm text-[#4A5568] mt-1 max-w-md mx-auto">{hint}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
