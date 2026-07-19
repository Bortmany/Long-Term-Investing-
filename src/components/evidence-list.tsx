// EvidenceList (ui-spec-phases-2-6.md §2.5) — the recurring "point +
// supporting evidence" shape: Health/Stock Score recommendations, Sell
// Analysis reasons/counterarguments, Thesis Check's supporting/weakening/
// improving columns. Built once here in Phase 3; later phases import it
// unchanged.
export type EvidenceListItem = {
  point: string;
  evidence?: string[];
};

export function EvidenceList({ items }: { items: EvidenceListItem[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={index}>
          <p className="text-sm font-medium">{item.point}</p>
          {item.evidence && item.evidence.length > 0 ? (
            <ul className="mt-0.5 space-y-0.5 pl-4">
              {item.evidence.map((line, evidenceIndex) => (
                <li
                  key={evidenceIndex}
                  className="text-xs text-slate-500 dark:text-slate-400"
                >
                  Evidence: {line}
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
