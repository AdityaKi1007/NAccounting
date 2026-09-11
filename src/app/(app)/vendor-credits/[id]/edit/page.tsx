import VendorCreditFormPage from "@/components/vendor-credits/VendorCreditFormPage";

// Vendor Credits have a read-only detail view (item table + Journal) at /vendor-credits/[id]
// — see the sibling page.tsx — so editing moves one level deeper.
export default function VendorCreditEditPage({ params }: { params: { id: string } }) {
  return <VendorCreditFormPage id={params.id} />;
}
