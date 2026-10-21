/**
 * Shown the instant a page is opened, while its numbers load: the menu stays put and the
 * page's outline appears right away, so every click answers immediately.
 */
export default function Loading() {
  const bar = "rounded-full bg-surface-2";
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-6">
        <div className={`${bar} h-8 w-64`} />
        <div className={`${bar} mt-3 h-4 w-80 max-w-full`} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-[108px] p-5">
            <div className={`${bar} h-3 w-20`} />
            <div className={`${bar} mt-4 h-6 w-28`} />
          </div>
        ))}
      </div>
      <div className="card mt-4 p-5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`${bar} mb-4 h-4 last:mb-0`} style={{ width: `${92 - i * 9}%` }} />
        ))}
      </div>
    </div>
  );
}
