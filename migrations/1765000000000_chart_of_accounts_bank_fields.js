/* eslint-disable */
exports.shorthands = undefined;

// Two more optional fields on Chart of Accounts entries (following the same "chart-of-
// accounts", not "bank-accounts", table the user asked for): IBAN Number and Bank Name.
// Lets a bank/cash-type account record its own IBAN/bank name directly on the Chart of
// Accounts entry, separate from the existing standalone Banking module (bank_accounts table)
// which already has its own account_number/bank_name fields for a different purpose (managing
// actual bank connections, not just the GL account definition).
exports.up = (pgm) => {
  pgm.addColumns('accounts', {
    iban_number: { type: 'text' },
    bank_name: { type: 'text' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('accounts', ['iban_number', 'bank_name']);
};
