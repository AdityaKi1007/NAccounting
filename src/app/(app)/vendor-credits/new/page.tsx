import VendorCreditFormPage from "@/components/vendor-credits/VendorCreditFormPage";

// A literal "new" route, not just the generic /[slug]/new one — same reasoning as
// bills/new/page.tsx.
export default function VendorCreditsNewPage() {
  return <VendorCreditFormPage />;
}
