import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Settings2, ShieldAlert } from "lucide-react";
import { getSettingsItem } from "@/lib/settings";
import { requireActiveContext } from "@/lib/session";
import { canManageOrgSettings } from "@/lib/module-access";
import { queryOne, query } from "@/lib/db";
import { orgDisplayId } from "@/lib/format";
import CompanyProfileForm from "@/components/settings/CompanyProfileForm";
import UsersList from "@/components/settings/UsersList";
import BrandingForm from "@/components/settings/BrandingForm";
import CustomDomainForm from "@/components/settings/CustomDomainForm";
import TaxSettingsForm from "@/components/settings/TaxSettingsForm";
import TaxPreferencesForm from "@/components/settings/TaxPreferencesForm";
import CorporateTaxForm from "@/components/settings/CorporateTaxForm";
import RemindersManager from "@/components/settings/RemindersManager";
import SettingsEntityList from "@/components/settings/SettingsEntityList";
import ApiKeysManager from "@/components/settings/ApiKeysManager";
import ApiFieldConfigBuilder from "@/components/settings/ApiFieldConfigBuilder";
import NumberSeriesSettings from "@/components/settings/NumberSeriesSettings";
import OpeningBalancesManager from "@/components/settings/OpeningBalancesManager";
import EmailSettingsForm from "@/components/settings/EmailSettingsForm";
import S3StorageSettingsForm from "@/components/settings/S3StorageSettingsForm";
import GeneralSettingsInfo from "@/components/settings/GeneralSettingsInfo";
import AuditLogViewer from "@/components/settings/AuditLogViewer";
import DebugLogsViewer from "@/components/settings/DebugLogsViewer";
import ApiUsageDetails from "@/components/settings/ApiUsageDetails";
import RevenueRecognitionSettings from "@/components/settings/RevenueRecognitionSettings";
import AccessMatrixManager from "@/components/settings/AccessMatrixManager";
import { getOrCreateNumberSeries, NUMBER_SERIES_MODULES } from "@/lib/number-series";
import { accountCategory } from "@/lib/accounts";
import { getOrgLogoDataUri } from "@/lib/s3";

export default async function SettingsItemPage({
  params,
}: {
  params: { group: string; item: string };
}) {
  const found = getSettingsItem(params.group, params.item);
  if (!found) notFound();
  const { group, item } = found;

  const ctx = await requireActiveContext();

  // Settings edit access: owner/admin of this org, or a platform Super Admin regardless of
  // their membership role here — see canManageOrgSettings (src/lib/module-access.ts). Every
  // /api/settings/* route (and /api/entities/[entity] for the adminOnly entities below)
  // independently enforces the same check; this is what keeps the page itself from showing a
  // fully-live form to anyone else. 2026-09-15: "setting editable access should be with super
  // admin and company admin only, other roles should have read only access."
  const canManage = canManageOrgSettings(ctx);

  const orgSeq =
    item.view === "company-profile"
      ? (await queryOne<{ org_seq: string }>(`SELECT org_seq FROM organizations WHERE id = $1`, [ctx.orgId]))
          ?.org_seq
      : null;

  // Resolved server-side as an inline data: URI (never a presigned S3 URL) — see the comment
  // on getOrgLogoDataUri in src/lib/s3.ts for why. Only fetched for the one settings view
  // that actually shows it, same as orgSeq/emailRow/s3Row above.
  const logoDataUri = item.view === "company-profile" ? await getOrgLogoDataUri(ctx.orgId) : null;

  // All three email providers' saved fields at once, so the client component can offer the
  // Provider dropdown without a second round trip. Mirrors the shape /api/settings/email GET
  // returns — see shapeRow() there.
  const emailRow =
    item.view === "email-settings"
      ? await queryOne<{
          email_provider: "smtp" | "sendgrid" | "ses" | null;
          smtp_host: string | null;
          smtp_port: number | null;
          smtp_user: string | null;
          smtp_from: string | null;
          smtp_from_name: string | null;
          smtp_secure: boolean;
          smtp_password_set: boolean;
          sendgrid_from_name: string | null;
          sendgrid_from_email: string | null;
          sendgrid_api_key_set: boolean;
          ses_access_key_id: string | null;
          ses_region: string | null;
          ses_from_name: string | null;
          ses_from_email: string | null;
          ses_secret_key_set: boolean;
        }>(
          `SELECT email_provider, smtp_host, smtp_port, smtp_user, smtp_from, smtp_from_name, smtp_secure,
                  (smtp_password_encrypted IS NOT NULL) AS smtp_password_set,
                  sendgrid_from_name, sendgrid_from_email,
                  (sendgrid_api_key_encrypted IS NOT NULL) AS sendgrid_api_key_set,
                  ses_access_key_id, ses_region, ses_from_name, ses_from_email,
                  (ses_secret_access_key_encrypted IS NOT NULL) AS ses_secret_key_set
           FROM organizations WHERE id = $1`,
          [ctx.orgId]
        )
      : null;

  const s3Row =
    item.view === "file-storage"
      ? await queryOne<{
          s3_access_key_id: string | null;
          s3_region: string | null;
          s3_bucket_name: string | null;
          s3_endpoint: string | null;
          s3_force_path_style: boolean;
          secret_key_set: boolean;
        }>(
          `SELECT s3_access_key_id, s3_region, s3_bucket_name, s3_endpoint, s3_force_path_style,
                  (s3_secret_access_key_encrypted IS NOT NULL) AS secret_key_set
           FROM organizations WHERE id = $1`,
          [ctx.orgId]
        )
      : null;

  // Read-only account info (Subscription Plan / Max Users / API Request Limit) — every value
  // here is set by a Super Admin (see the Super Admin panel), never by this page.
  const generalInfo =
    item.view === "general-info"
      ? await (async () => {
          const [org, userCount, apiUsageToday] = await Promise.all([
            queryOne<{
              subscription_plan: string;
              max_users: number | null;
              api_request_limit_per_day: number | null;
            }>(
              `SELECT subscription_plan, max_users, api_request_limit_per_day FROM organizations WHERE id = $1`,
              [ctx.orgId]
            ),
            queryOne<{ count: string }>(`SELECT count(*) FROM memberships WHERE organization_id = $1`, [ctx.orgId]),
            queryOne<{ request_count: number }>(
              `SELECT request_count FROM api_usage_daily WHERE organization_id = $1 AND usage_date = CURRENT_DATE`,
              [ctx.orgId]
            ),
          ]);
          return {
            subscriptionPlan: org?.subscription_plan ?? "standard",
            maxUsers: org?.max_users ?? null,
            currentUserCount: Number(userCount?.count ?? 0),
            apiRequestLimitPerDay: org?.api_request_limit_per_day ?? null,
            apiRequestsToday: apiUsageToday?.request_count ?? 0,
          };
        })()
      : null;

  // Owner/Admin/Super Admin — same canManageOrgSettings gate as every other settings screen
  // (updated 2026-09-15; previously Owner/Admin only, missing the Super Admin exemption that
  // /api/settings/audit-logs already enforces independently).
  const canViewAuditLogs = canManage;

  // Debug Logs — Owner/Admin/Super Admin, per the request ("delete option ... by admin and
  // super admin"); every /api/settings/debug-logs* route enforces this same check
  // independently regardless of what this page shows.
  const canManageDebugLogs = canManage;

  const debugLogsEnabled =
    item.view === "debug-logs" && canManageDebugLogs
      ? Boolean(
          (await queryOne<{ debug_logs_enabled: boolean }>(`SELECT debug_logs_enabled FROM organizations WHERE id = $1`, [ctx.orgId]))
            ?.debug_logs_enabled
        )
      : false;

  // Access Matrix (custom roles + the 10-level read/write/delete grid): Owner/Admin/Super
  // Admin only, per the request this feature was built from ("accessed by Admin or Super
  // Admin"). API-side, this is independently enforced by the "roles" entity's adminOnly flag
  // and the /api/settings/roles/[id]/permissions PUT route — this is just what keeps the page
  // itself from showing the roles table / matrix to an ordinary staff member.
  const canManageAccessMatrix = canManage;

  const accessMatrixRoles =
    item.view === "access-matrix" && canManageAccessMatrix
      ? ((await query(
          `SELECT id, name FROM roles WHERE organization_id = $1 ORDER BY name ASC`,
          [ctx.orgId]
        )) as { id: string; name: string }[])
      : null;

  const auditLogUsers =
    item.view === "audit-logs" && canViewAuditLogs
      ? ((await query(
          `SELECT u.id AS user_id, u.name, u.email
           FROM memberships m JOIN users u ON u.id = m.user_id
           WHERE m.organization_id = $1
           ORDER BY u.name ASC`,
          [ctx.orgId]
        )) as { user_id: string; name: string; email: string }[])
      : null;

  // Reuses the existing api_keys.request_count/last_used_at and api_usage_daily counters
  // (already tracked in api-context.ts) rather than a new per-request log table — see
  // ApiUsageDetails.tsx.
  const apiUsageData =
    item.view === "api-usage"
      ? await (async () => {
          const [org, todayUsage, daily, keys] = await Promise.all([
            queryOne<{ api_request_limit_per_day: number | null }>(
              `SELECT api_request_limit_per_day FROM organizations WHERE id = $1`,
              [ctx.orgId]
            ),
            queryOne<{ request_count: number }>(
              `SELECT request_count FROM api_usage_daily WHERE organization_id = $1 AND usage_date = CURRENT_DATE`,
              [ctx.orgId]
            ),
            query(
              `SELECT usage_date, request_count FROM api_usage_daily
               WHERE organization_id = $1 AND usage_date >= CURRENT_DATE - INTERVAL '13 days'
               ORDER BY usage_date DESC`,
              [ctx.orgId]
            ) as Promise<{ usage_date: string; request_count: number }[]>,
            query(
              `SELECT id, name, key_prefix, is_active, request_count, last_used_at, created_at
               FROM api_keys WHERE organization_id = $1 ORDER BY request_count DESC, created_at ASC`,
              [ctx.orgId]
            ) as Promise<
              {
                id: string;
                name: string;
                key_prefix: string;
                is_active: boolean;
                request_count: number;
                last_used_at: string | null;
                created_at: string;
              }[]
            >,
          ]);
          return {
            apiRequestLimitPerDay: org?.api_request_limit_per_day ?? null,
            requestsToday: todayUsage?.request_count ?? 0,
            dailyUsage: daily,
            apiKeys: keys,
          };
        })()
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
        {item.view !== "api-keys" && item.view !== "audit-logs" && item.view !== "debug-logs" && (
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
            initialLogoDataUri={logoDataUri}
            canManage={canManage}
          />
        )}

        {item.view === "users-list" && (
          <UsersList
            users={
              (await query(
                `SELECT m.id AS membership_id, m.role, m.role_id, m.created_at AS joined_at, u.id AS user_id, u.name, u.email
                 FROM memberships m
                 JOIN users u ON u.id = m.user_id
                 WHERE m.organization_id = $1
                 ORDER BY m.created_at ASC`,
                [ctx.orgId]
              )) as never[]
            }
            roles={
              (await query(`SELECT id, name FROM roles WHERE organization_id = $1 ORDER BY name ASC`, [
                ctx.orgId,
              ])) as { id: string; name: string }[]
            }
            canManage={canManage}
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
            canManage={canManage}
          />
        )}

        {item.view === "custom-domain" && (
          <CustomDomainForm
            organization={
              (await queryOne(
                `SELECT id, custom_domain_subdomain, custom_domain_enabled FROM organizations WHERE id = $1`,
                [ctx.orgId]
              )) as { id: string; custom_domain_subdomain: string | null; custom_domain_enabled: boolean }
            }
            canManage={canManage}
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
            canManage={canManage}
          />
        )}

        {item.view === "tax-rates-list" && (
          <div className="space-y-3">
            <SettingsEntityList entityKey="tax-rates" orgId={ctx.orgId} canManage={canManage} />
            <p className="text-xs text-gray-400">
              Note: <span className="font-medium text-green-700">Default Tax</span> rate will be used for
              transactions involving a customer whose Tax Preference isn&apos;t configured.
            </p>
          </div>
        )}

        {item.view === "tax-preferences" && (
          <TaxPreferencesForm
            organization={
              (await queryOne(`SELECT id, profit_margin_scheme_enabled FROM organizations WHERE id = $1`, [
                ctx.orgId,
              ])) as { id: string; profit_margin_scheme_enabled: boolean }
            }
            canManage={canManage}
          />
        )}

        {item.view === "corporate-tax" && (
          <CorporateTaxForm
            organization={
              (await queryOne(
                `SELECT id, corporate_tax_registration_number, corporate_tax_rate, corporate_tax_first_return_from,
                        corporate_tax_liability_account_id, corporate_tax_liability_offset_account_id,
                        corporate_tax_add_back_expense_account_id, corporate_tax_income_deducted_account_id,
                        corporate_tax_entertainment_expenditure_account_id, corporate_tax_net_interest_expenditure_account_id
                 FROM organizations WHERE id = $1`,
                [ctx.orgId]
              )) as {
                id: string;
                corporate_tax_registration_number: string | null;
                corporate_tax_rate: number | string;
                corporate_tax_first_return_from: string | Date | null;
                corporate_tax_liability_account_id: string | null;
                corporate_tax_liability_offset_account_id: string | null;
                corporate_tax_add_back_expense_account_id: string | null;
                corporate_tax_income_deducted_account_id: string | null;
                corporate_tax_entertainment_expenditure_account_id: string | null;
                corporate_tax_net_interest_expenditure_account_id: string | null;
              }
            }
            accountOptions={(
              (await query(
                `SELECT id, code, name FROM accounts WHERE organization_id = $1 AND is_active = true ORDER BY code ASC NULLS LAST, name ASC`,
                [ctx.orgId]
              )) as { id: string; code: string | null; name: string }[]
            ).map((a) => ({ id: a.id, label: a.code ? `${a.code} - ${a.name}` : a.name }))}
            canManage={canManage}
          />
        )}

        {item.view === "general-info" && generalInfo && (
          <GeneralSettingsInfo
            subscriptionPlan={generalInfo.subscriptionPlan}
            maxUsers={generalInfo.maxUsers}
            currentUserCount={generalInfo.currentUserCount}
            apiRequestLimitPerDay={generalInfo.apiRequestLimitPerDay}
            apiRequestsToday={generalInfo.apiRequestsToday}
          />
        )}

        {item.view === "currencies-list" && (
          <SettingsEntityList entityKey="currencies" orgId={ctx.orgId} canManage={canManage} />
        )}
        {item.view === "payment-terms-list" && (
          <SettingsEntityList entityKey="payment-terms" orgId={ctx.orgId} canManage={canManage} />
        )}

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
            canManage={canManage}
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
            canManage={canManage}
          />
        )}

        {item.view === "opening-balances" && (
          <OpeningBalancesManager
            currency={(await queryOne<{ currency: string }>(`SELECT currency FROM organizations WHERE id = $1`, [ctx.orgId]))?.currency ?? "AED"}
            migrationDate={
              (
                await queryOne<{ opening_balance_migration_date: string | Date | null }>(
                  `SELECT opening_balance_migration_date FROM organizations WHERE id = $1`,
                  [ctx.orgId]
                )
              )?.opening_balance_migration_date ?? null
            }
            journalLines={
              (await query(
                `SELECT jl.account_id, a.code, a.name, a.type, jl.debit, jl.credit, jl.description
                 FROM journal_lines jl
                 JOIN manual_journals mj ON mj.id = jl.journal_id
                 JOIN accounts a ON a.id = jl.account_id
                 WHERE mj.organization_id = $1 AND mj.is_opening_balance = true
                 ORDER BY jl.id ASC`,
                [ctx.orgId]
              )) as {
                account_id: string;
                code: string | null;
                name: string;
                type: string;
                debit: string;
                credit: string;
                description: string;
              }[]
            }
            editableAccounts={(
              (
                await query(
                  `SELECT a.id, a.code, a.name, a.type,
                          COALESCE(aob.debit, 0) AS debit, COALESCE(aob.credit, 0) AS credit
                   FROM accounts a
                   LEFT JOIN account_opening_balances aob
                     ON aob.account_id = a.id AND aob.organization_id = a.organization_id
                   WHERE a.organization_id = $1 AND a.is_active = true
                     AND a.type NOT IN ('accounts_receivable', 'accounts_payable')
                   ORDER BY a.code ASC NULLS LAST, a.name ASC`,
                  [ctx.orgId]
                )
              ) as { id: string; code: string | null; name: string; type: string; debit: string; credit: string }[]
            )
              .filter((a) => {
                const cat = accountCategory(a.type);
                return cat === "asset" || cat === "liability" || cat === "equity";
              })
              .map((a) => ({
                id: a.id,
                code: a.code,
                name: a.name,
                type: a.type,
                category: accountCategory(a.type) as "asset" | "liability" | "equity",
                debit: Number(a.debit),
                credit: Number(a.credit),
              }))}
            arAccount={
              (await queryOne<{ id: string; code: string | null; name: string }>(
                `SELECT id, code, name FROM accounts WHERE organization_id = $1 AND type = 'accounts_receivable' AND is_active = true
                 ORDER BY code ASC NULLS LAST LIMIT 1`,
                [ctx.orgId]
              )) ?? null
            }
            apAccount={
              (await queryOne<{ id: string; code: string | null; name: string }>(
                `SELECT id, code, name FROM accounts WHERE organization_id = $1 AND type = 'accounts_payable' AND is_active = true
                 ORDER BY code ASC NULLS LAST LIMIT 1`,
                [ctx.orgId]
              )) ?? null
            }
            customerOpeningTotal={Number(
              (await queryOne<{ sum: string | null }>(`SELECT COALESCE(SUM(opening_balance), 0) AS sum FROM customers WHERE organization_id = $1`, [
                ctx.orgId,
              ]))?.sum ?? 0
            )}
            vendorOpeningTotal={Number(
              (await queryOne<{ sum: string | null }>(`SELECT COALESCE(SUM(opening_balance), 0) AS sum FROM vendors WHERE organization_id = $1`, [
                ctx.orgId,
              ]))?.sum ?? 0
            )}
            canManage={canManage}
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
            canManage={canManage}
          />
        )}

        {item.view === "api-keys" && <ApiFieldConfigBuilder canManage={canManage} />}

        {item.view === "email-settings" && (
          <EmailSettingsForm
            initial={(() => {
              const row = emailRow;
              return {
                active_provider: row?.email_provider ?? null,
                smtp: {
                  host: row?.smtp_host ?? "",
                  port: row?.smtp_port ?? null,
                  user: row?.smtp_user ?? "",
                  from: row?.smtp_from ?? "",
                  from_name: row?.smtp_from_name ?? "",
                  secure: Boolean(row?.smtp_secure),
                  password_set: Boolean(row?.smtp_password_set),
                },
                sendgrid: {
                  from_name: row?.sendgrid_from_name ?? "",
                  from_email: row?.sendgrid_from_email ?? "",
                  api_key_set: Boolean(row?.sendgrid_api_key_set),
                },
                ses: {
                  access_key_id: row?.ses_access_key_id ?? "",
                  region: row?.ses_region ?? "",
                  from_name: row?.ses_from_name ?? "",
                  from_email: row?.ses_from_email ?? "",
                  secret_key_set: Boolean(row?.ses_secret_key_set),
                },
              };
            })()}
            defaultTestEmail={ctx.userEmail}
            canManage={canManage}
          />
        )}

        {item.view === "file-storage" && (
          <S3StorageSettingsForm
            initial={(() => {
              const row = s3Row;
              return {
                s3_access_key_id: row?.s3_access_key_id ?? "",
                s3_region: row?.s3_region ?? "",
                s3_bucket_name: row?.s3_bucket_name ?? "",
                s3_endpoint: row?.s3_endpoint ?? "",
                s3_force_path_style: Boolean(row?.s3_force_path_style),
                secret_key_set: Boolean(row?.secret_key_set),
              };
            })()}
            canManage={canManage}
          />
        )}

        {item.view === "audit-logs" &&
          (canViewAuditLogs ? (
            <AuditLogViewer users={auditLogUsers ?? []} />
          ) : (
            <div className="card flex flex-col items-center justify-center gap-3 py-24 text-center">
              <ShieldAlert size={40} className="text-gray-300" />
              <h2 className="text-base font-semibold text-ink-800">Owner, Admin and Super Admin Only</h2>
              <p className="max-w-sm text-sm text-gray-500">
                Audit logs are visible only to your organization&apos;s Owner, Admin, and Super Admin. Ask one of
                them if you need to see a change here.
              </p>
            </div>
          ))}

        {item.view === "debug-logs" &&
          (canManageDebugLogs ? (
            <DebugLogsViewer initialEnabled={debugLogsEnabled} />
          ) : (
            <div className="card flex flex-col items-center justify-center gap-3 py-24 text-center">
              <ShieldAlert size={40} className="text-gray-300" />
              <h2 className="text-base font-semibold text-ink-800">Owner, Admin and Super Admin Only</h2>
              <p className="max-w-sm text-sm text-gray-500">
                Debug Logs are visible only to your organization&apos;s Owner, Admin, and Super Admin. Ask one
                of them if you need to see or clear a captured exception here.
              </p>
            </div>
          ))}

        {item.view === "api-usage" && apiUsageData && (
          <ApiUsageDetails
            apiRequestLimitPerDay={apiUsageData.apiRequestLimitPerDay}
            requestsToday={apiUsageData.requestsToday}
            dailyUsage={apiUsageData.dailyUsage}
            apiKeys={apiUsageData.apiKeys}
          />
        )}

        {item.view === "revenue-recognition" && (
          <RevenueRecognitionSettings orgId={ctx.orgId} canManage={canManage} />
        )}

        {item.view === "access-matrix" &&
          (canManageAccessMatrix ? (
            <div className="space-y-6">
              <div>
                <h2 className="mb-2 text-sm font-semibold text-ink-800">Roles</h2>
                <SettingsEntityList entityKey="roles" orgId={ctx.orgId} canManage={canManageAccessMatrix} />
              </div>
              <div>
                <h2 className="mb-2 text-sm font-semibold text-ink-800">Access Matrix</h2>
                <AccessMatrixManager roles={accessMatrixRoles ?? []} />
              </div>
            </div>
          ) : (
            <div className="card flex flex-col items-center justify-center gap-3 py-24 text-center">
              <ShieldAlert size={40} className="text-gray-300" />
              <h2 className="text-base font-semibold text-ink-800">Owner, Admin and Super Admin Only</h2>
              <p className="max-w-sm text-sm text-gray-500">
                The Access Matrix is visible only to your organization&apos;s Owner, Admin, and Super Admin. Ask
                one of them if you need a role&apos;s access changed.
              </p>
            </div>
          ))}

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
