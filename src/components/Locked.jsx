// A button that is always shown, so every account sees the same layout.
// When the person isn't allowed to use it, it shows greyed out with a small lock instead of disappearing.
export const LockIcon = () => (
  <svg className="lock-ico" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
    <path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
  </svg>
);

export function AdminBtn({ allowed, className = 'btn', why = 'Admins only', children, ...rest }) {
  if (allowed) return <button className={className} {...rest}>{children}</button>;
  return (
    <button type="button" className={`${className} locked`} disabled aria-disabled="true" title={why}>
      <LockIcon />{children}
    </button>
  );
}
