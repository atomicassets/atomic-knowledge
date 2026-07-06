# Chain RPC behavior

Validated nodeos RPC behavior on WAX (Antelope) relevant to Atomic integrations.

## Error 3060002 means the account does not exist

When `/v1/chain/get_account` is queried for an account that does not exist, a WAX (Antelope) node responds HTTP 400 with `error.code` 3060002 and `error.name` `account_query_exception`; the detail message reads "unable to retrieve account info (unknown key ...)" from `chain_plugin.cpp`. This error is deterministic (the account has no on-chain presence), not a transient RPC failure, so retrying is pointless and classifying it as a generic error traps callers in retry loops. Services verifying account existence should map 3060002 to a distinct account-not-found response instead of a generic rejection. This case is common on WAX because Cloud Wallet lets users complete signup with a reserved `.wam` name before the on-chain `newaccount` action confirms, leaving a working wallet UX with no chain account. When detecting the error through a client library such as @wharfkit/antelope's APIClient, check both the structured code (3060002, which may arrive as number or string) and the message text `account_query_exception`, since proxies can strip either.
