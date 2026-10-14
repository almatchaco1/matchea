// Pages for long lists: 10 at a time, with Previous / Next and page numbers.
// usePage(list, resetKey) gives the 10 rows to show; <Pager {...pg} /> draws the buttons (hidden for 10 or fewer).
// resetKey: when a search or filter changes, go back to page 1.
import { useEffect, useMemo, useState } from 'react';

export const PAGE_SIZE = 10;

export function usePage(list, resetKey = '') {
  const [page, setPage] = useState(1);
  const total = list?.length || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [resetKey]);
  const cur = Math.min(page, pages); // the list got shorter: stay on its last page
  const rows = useMemo(() => (list || []).slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE), [list, cur]);
  return { rows, page: cur, pages, total, setPage };
}

/** Which page numbers to show: 1 … 4 5 6 … 12 */
function numbers(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out = [1];
  const a = Math.max(2, page - 1), b = Math.min(pages - 1, page + 1);
  if (a > 2) out.push('…a');
  for (let i = a; i <= b; i++) out.push(i);
  if (b < pages - 1) out.push('…b');
  out.push(pages);
  return out;
}

export function Pager({ page, pages, total, setPage, what = '' }) {
  if (total <= PAGE_SIZE) return null;
  const from = (page - 1) * PAGE_SIZE + 1, to = Math.min(total, page * PAGE_SIZE);
  const go = (p) => setPage(Math.max(1, Math.min(pages, p)));
  return (
    <nav className="pager" aria-label={what ? `${what} pages` : 'Pages'}>
      <span className="pager-info num">{from}–{to} of {total}{what ? ` ${what}` : ''}</span>
      <span className="pager-btns">
        <button type="button" className="pager-b" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page">‹ <span className="pager-w">Prev</span></button>
        {numbers(page, pages).map((n) => (typeof n === 'string'
          ? <span key={n} className="pager-gap" aria-hidden="true">…</span>
          : <button type="button" key={n} className={`pager-b pager-n num ${n === page ? 'on' : ''}`} onClick={() => go(n)} aria-current={n === page ? 'page' : undefined} aria-label={`Page ${n}`}>{n}</button>))}
        <button type="button" className="pager-b" onClick={() => go(page + 1)} disabled={page >= pages} aria-label="Next page"><span className="pager-w">Next</span> ›</button>
      </span>
    </nav>
  );
}

/** For lists drawn where hooks can't be used: <Paged list={rows} resetKey={filter} what="drinks">{(page) => …}</Paged> */
export function Paged({ list, resetKey = '', what = '', children }) {
  const pg = usePage(list, resetKey);
  return <>{children(pg.rows)}<Pager {...pg} what={what} /></>;
}
