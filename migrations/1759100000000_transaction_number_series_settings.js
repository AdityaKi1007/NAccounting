/* eslint-disable */
exports.shorthands = undefined;

// Backs the new Settings -> Customization -> Transaction Number Series page (see
// src/components/settings/NumberSeriesSettings.tsx). The page shows an "Enable Multiple
// Transaction Series" toggle matching Zoho Books' real settings screen; this build only
// implements a single ("Default") series per module, so the toggle just records the org's
// preference and the page explains the limitation when it's on, rather than pretending to
// offer named per-branch series.
exports.up = (pgm) => {
  pgm.addColumns('organizations', {
    multiple_transaction_series_enabled: { type: 'boolean', notNull: true, default: false },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('organizations', ['multiple_transaction_series_enabled']);
};
