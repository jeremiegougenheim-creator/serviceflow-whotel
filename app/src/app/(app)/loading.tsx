/** Shown while a screen's data loads: the shell is already on screen, this keeps the layout still. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-5">
        <div className="skel h-8 w-3/5 md:h-10" />
        <div className="skel mt-3 h-4 w-2/5" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card px-4 py-3.5">
            <div className="skel h-2.5 w-1/2" />
            <div className="skel mt-3 h-8 w-2/3" />
            <div className="skel mt-2 h-3 w-3/4" />
          </div>
        ))}
      </div>
      <div className="skel mt-6 h-5 w-1/3" />
      <div className="card mt-2 px-4 py-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="skel h-4 w-3/4" />
              <div className="skel mt-2 h-3 w-1/2" />
            </div>
            <div className="skel h-6 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
