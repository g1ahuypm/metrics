export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 2xl:flex-row 2xl:items-end 2xl:justify-between">
      <div>
        <h1 className="text-[28px] font-extrabold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-[15px] text-ink-2">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
