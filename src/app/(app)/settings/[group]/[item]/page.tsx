import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Settings2 } from "lucide-react";
import { getSettingsItem } from "@/lib/settings";
import { requireActiveContext } from "@/lib/session";
import { queryOne, query } from "@/lib/db";
import { orgDisplayId } from "@/lib/format";
import CompanyProfileForm from "@/components/settings/CompanyProfileForm";
import UsersList from "@/components/settings/UsersList";
import BrandingForm from "@/components/settings/BrandingForm";
import TaxSettingsForm from "@/components/settings/TaxSettingsForm";
import RemindersManager from "@/components/settings/RemindersManager";
import SettingsEntityList from "@/components/settings/SettingsEntityList";
import ApiKeysManager from "@/components/settings/ApiKeysManager";
import NumberSeriesSettings from "@/components/settings/NumberSeriesSettings";
import { getOrCreateNumberSeries, NUMBER_SERIES_MODULES } from "@/lib/number-series";

export default async function SettingsItemPage({
  params,
}: {
  params: { group: string; item: string };
}) {
  const found = getSettingsItem(params.group, params.item);
  if (!found) notFound();
  const { group, item } = found;

  const ctx = await requireActiveContext();

  const orgSeq =
    item.view === "company-profile"
      ? (await queryOne<{ org_seq: string }>(`SELECT org_seq FROM organizations WHERE id = $1`, [ctx.orgId]))
          ?.org_seq
      : null;

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mb-1 flex items-center gap-1 text-xs text-gray-400">
          <Link href="/settings" className="hover:text-brand-600 hover:underline">
            All Settings
          </Link>
          <ChevronRight size={12} />
          <span>{group.label}</span>
          <ChevronRight size={12} />
          <span className="text-ink-700">{item.label}</span>
        </div>
        {item.view !== "api-keys" && (
          <>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-ink-800">
                {item.view === "company-profile" ? "Company Profile" : item.label}
              </h1>
              {item.view === "company-profile" && orgSeq != null && (
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                  ID: {orgDisplayId(orgSeq)}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-gray-500">{item.description}</p>
          </>
        )}
      </div>

      <div className="p-6">
        {item.view === "company-profile" && (
          <CompanyProfileForm
            organization={
              (await queryOne(
                `SELECT id, name, currency, fiscal_year_start, industry, location_country, is_designated_zone,
                        registration_number, tax_registration_number, address_attention, address_street1,
                        address_street2, address_city, address_state, address_zip, address_phone, address_fax,
                        timezone, date_format, report_basis
                 FROM organizations WHERE id = $1`,
                [ctx.orgId]
              )) as {
                id: string;
                name: string;
                currency: string;
                fiscal_year_start: string;
                industry: string | null;
                location_country: string;
                is_designated_zone: boolean;
                registration_number: string | null;
                tax_registration_number: string | null;
                address_attention: string | null;
                address_street1: string | null;
                address_street2: string | null;
                address_city: string | null;
                address_state: string | null;
                address_zip: string | null;
                address_phone: string | null;
                address_fax: string | null;
                timezone: string;
                date_format: string;
                report_basis: string;
              }
            }
          />
        )}

        {item.view === "users-list" && (
          <UsersList
            users={
              (await query(
                `SELECT m.id AS membership_id, m.role, m.created_at AS joined_at, u.id AS user_id, u.name, u.email
                 FROM memberships m
                 JOIN users u ON u.id = m.user_id
                 WHERE m.organization_id = $1
                 ORDER BY m.created_at ASC`,
                [ctx.orgId]
              )) as never[]
            }
            canManage={ctx.role === "owner" || ctx.role === "admin"}
          />
        )}

        {item.view === "branding" && (
          <BrandingForm
            organization={
              (await queryOne(
                `SELECT id, accent_color, accent_custom_hex, theme_preference FROM organizations WHERE id = $1`,
                [ctx.orgId]
              )) as { id: string; accent_color: string; accent_custom_hex: string | null; theme_preference: string }
            }
          />
        )}

        {item.view === "tax-settings" && (
          <TaxSettingsForm
            organization={
              (await queryOne(
                `SELECT id, tax_registration_number, tax_identification_number, international_trade_enabled,
                        business_legal_name, business_trade_name, vat_registered_on, first_tax_return_from,
                        tax_reporting_period
                 FROM organizations WHERE id = $1`,
                [ctx.orgId]
              )) as {
                id: string;
                tax_registration_number: string | null;
                tax_identification_number: string | null;
                international_trade_enabled: boolean;
                business_legal_name: string | null;
                business_trade_name: string | null;
                vat_registered_on: string | Date | null;
                first_tax_return_from: string | Date | null;
                tax_reporting_period: string;
              }
            }
            canManage={ctx.role === "owner" || ctx.role === "admin"}
          />
        )}

        {item.view === "roles-list" && <SettingsEntityList entityKey="roles" orgId={ctx.orgId} />}
        {item.view === "currencies-list" && <SettingsEntityList entityKey="currencies" orgId={ctx.orgId} />}
        {item.view === "payment-terms-list" && <SettingsEntityList entityKey="payment-terms" orgId={ctx.orgId} />}

        {item.view === "reminders" && (
          <RemindersManager
            invoiceReminders={
              (await query(`SELECT * FROM reminder_rules WHERE organization_id = $1 AND doc_type = 'invoices' ORDER BY created_at ASC`, [
                ctx.orgId,
              ])) as never[]
            }
            billReminders={
              (await query(`SELECT * FROM reminder_rules WHERE organization_id = $1 AND doc_type = 'bills' ORDER BY created_at ASC`, [
                ctx.orgId,
              ])) as never[]
            }
          />
        )}

        {item.view === "number-series" && (
          <NumberSeriesSettings
            initialRows={await Promise.all(
              NUMBER_SERIES_MODULES.map(async (m) => ({
                entityKey: m.entityKey,
                label: m.label,
                series: await getOrCreateNumberSeries(ctx.orgId, m.entityKey),
              }))
            )}
            initialMultipleSeriesEnabled={Boolean(
              (
                await queryOne<{ multiple_transaction_series_enabled: boolean }>(
                  `SELECT multiple_transaction_series_enabled FROM organizations WHERE id = $1`,
                  [ctx.orgId]
                )
              )?.multiple_transaction_series_enabled
            )}
            canManage={ctx.role === "owner" || ctx.role === "admin"}
          />
        )}

        {item.view === "api-keys" && (
          <ApiKeysManager
            keys={
              (await query(
                `SELECT id, name, key_prefix, is_active, last_used_at, request_count, created_at
                 FROM api_keys WHERE organization_id = $1 ORDER BY created_at ASC`,
                [ctx.orgId]
              )) as never[]
            }
          />
        )}

        {!item.view && (
          <div className="card flex flex-col items-center justify-center gap-3 py-24 text-center">
            <Settings2 size={40} className="text-gray-300" />
            <p className="max-w-sm text-sm text-gray-500">
              {item.label} settings aren&apos;t configurable yet in this build, but the page is wired up and
              ready for it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
