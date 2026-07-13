// Shared renderer for the recurring "point + supporting evidence" shape:
// Health/Stock Score recommendations, Sell Analysis reasons/counterarguments,
// Thesis Check's supporting/weakening/improving columns. Build once in
// Phase 3, import unchanged from Phases 4 and 5.

export type EvidencedPoint = {
  point: string;
  evidence?: string[];
};

export function EvidenceList({ items }: { items: EvidencedPoint[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item, index) => (
        <li key={index}>
          <p className="text-sm font-medium">{item.point}</p>
          {item.evidence && item.evidence.length > 0 ? (
            <ul className="mt-0.5 pl-4">
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
