import { ImportWizard } from "@/components/import/import-wizard";

export const metadata = { title: "Import Transactions — InvestIQ AI" };

// /portfolio/import — a standalone 4-step CSV import page. The page itself is
// thin: all steps (and their calls to the import server actions, which are
// session-scoped server-side) live in the wizard client component.
export default function PortfolioImportPage() {
  return <ImportWizard />;
}
