# nft-reward

Soroban smart contract for minting, transferring, and burning NFT reward tokens on the Stellar network. Each token is identified by a monotonically incrementing `u64` id and carries an IPFS/HTTPS URI pointing to its off-chain metadata.

Built with `soroban-sdk 20.0.0`, compiled as `#![no_std]`.

## Table of Contents

- [Entry Points](#entry-points)
  - [Write operations](#write-operations)
  - [Read operations](#read-operations)
- [Auth Requirements](#auth-requirements)
- [Error Behaviour](#error-behaviour)
- [Events](#events)
- [Storage Layout](#storage-layout)
- [Building and Testing](#building-and-testing)

---

## Entry Points

### Write operations

#### `mint(env, minter, recipient, uri) -> u64`

Mints a new NFT and assigns it to `recipient`.

| Parameter   | Type      | Description                                      |
|-------------|-----------|--------------------------------------------------|
| `minter`    | `Address` | The authorised minter creating the token.        |
| `recipient` | `Address` | The address that will own the new token.         |
| `uri`       | `String`  | Metadata URI (`ipfs://…` or `https://…`).        |

Returns the new `nft_id` (starts at 1, monotonically incremented).

Auth: `minter.require_auth()`

---

#### `mint_reward_nft_from_map(env, minter, recipient, uri) -> u64`

Variant of `mint` designed for reward-manager integrations. Accepts a URI that must pass the same scheme validation rules as `update_nft_metadata` (must be `ipfs://` or `https://`; empty, `http://`, and `data:` URIs are rejected).

Auth: `minter.require_auth()`

---

#### `transfer(env, from, to, nft_id)`

Transfers ownership of `nft_id` from `from` to `to`.

| Parameter | Type      | Description                      |
|-----------|-----------|----------------------------------|
| `from`    | `Address` | Current owner; must authorise.   |
| `to`      | `Address` | New owner.                       |
| `nft_id`  | `u64`     | Token to transfer.               |

Auth: `from.require_auth()`

Panics if the token does not exist or `from` is not the current owner.

---

#### `burn(env, owner, nft_id)`

Permanently destroys `nft_id`. The owner-index and ownership record are both cleared. `total_supply` is not decremented (it tracks tokens ever minted, not live tokens).

| Parameter | Type      | Description                        |
|-----------|-----------|------------------------------------|
| `owner`   | `Address` | Current owner; must authorise.     |
| `nft_id`  | `u64`     | Token to burn.                     |

Auth: `owner.require_auth()`

Panics if the token does not exist or `owner` is not the current owner.

---

#### `update_nft_metadata(env, owner, nft_id, new_uri)`

Replaces the URI of `nft_id` with `new_uri`. Requires the token to be neither locked nor frozen.

| Parameter  | Type      | Description                                      |
|------------|-----------|--------------------------------------------------|
| `owner`    | `Address` | Current owner; must authorise.                   |
| `nft_id`   | `u64`     | Token whose metadata is being updated.           |
| `new_uri`  | `String`  | Replacement URI (`ipfs://` or `https://` only).  |

Auth: `owner.require_auth()`

Panics if:
- `owner` is not the current owner of `nft_id`
- `new_uri` is empty, uses `http://`, or uses `data:`
- the token is locked (see `lock_nft`)
- the token is frozen (see `freeze_metadata`)

---

#### `admin_update_image_uri(env, admin, nft_id, new_uri)`

Admin override to replace the URI of `nft_id`. Requires the token to be neither locked nor frozen. Intended for post-mint CDN migration flows.

| Parameter | Type      | Description                                                |
|-----------|-----------|------------------------------------------------------------|
| `admin`   | `Address` | Contract admin; must authorise.                            |
| `nft_id`  | `u64`     | Token to update.                                           |
| `new_uri` | `String`  | Replacement URI (`ipfs://` or `https://` only).            |

Auth: `admin.require_auth()`

Panics if the token is locked or frozen.

---

#### `freeze_metadata(env, owner, nft_id)`

Permanently prevents further metadata updates on `nft_id`. Freeze is irreversible — once frozen, neither `update_nft_metadata` nor `admin_update_image_uri` can modify the token's URI.

| Parameter | Type      | Description                     |
|-----------|-----------|---------------------------------|
| `owner`   | `Address` | Current owner; must authorise.  |
| `nft_id`  | `u64`     | Token to freeze.                |

Auth: `owner.require_auth()`

---

#### `lock_nft(env, owner, nft_id)`

Temporarily prevents metadata updates on `nft_id`. Can be reversed with `unlock_nft`.

| Parameter | Type      | Description                     |
|-----------|-----------|---------------------------------|
| `owner`   | `Address` | Current owner; must authorise.  |
| `nft_id`  | `u64`     | Token to lock.                  |

Auth: `owner.require_auth()`

---

#### `unlock_nft(env, owner, nft_id)`

Removes a temporary lock set by `lock_nft`. Has no effect if the token is frozen.

| Parameter | Type      | Description                     |
|-----------|-----------|---------------------------------|
| `owner`   | `Address` | Current owner; must authorise.  |
| `nft_id`  | `u64`     | Token to unlock.                |

Auth: `owner.require_auth()`

---

### Read operations

| Entry point                                          | Returns        | Description                                                                |
|------------------------------------------------------|----------------|----------------------------------------------------------------------------|
| `balance_of(env, owner)`                             | `u32`          | Number of tokens currently owned by `owner`.                               |
| `total_supply(env)`                                  | `u64`          | Total tokens ever minted (monotonically increasing; not decremented by burn).|
| `get_owner(env, nft_id)`                             | `Option<Address>` | Current owner of `nft_id`, or `None` if burned.                        |
| `get_nft_uri(env, nft_id)`                           | `Option<String>`  | Metadata URI of `nft_id`, or `None` if not found.                      |
| `get_nft_minter(env, nft_id)`                        | `Option<Address>` | Original minter of `nft_id`, or `None` if not found.                   |
| `get_player_nfts(env, owner)`                        | `Vec<u64>`     | All token ids owned by `owner` (unordered).                                |
| `get_player_nfts_page(env, owner, start, limit)`     | `Vec<u64>`     | Paginated slice of `owner`'s token ids, starting at index `start`. Returns an empty vec if `start >= balance_of(owner)` or `limit == 0`. |

---

## Auth Requirements

| Entry point            | Who must sign         | Notes                                              |
|------------------------|-----------------------|----------------------------------------------------|
| `mint`                 | `minter`              | Any address designated as minter.                  |
| `mint_reward_nft_from_map` | `minter`          | Same as `mint`; called by the reward manager.      |
| `transfer`             | `from`                | Must be the current owner.                         |
| `burn`                 | `owner`               | Must be the current owner.                         |
| `update_nft_metadata`  | `owner`               | Must be the current owner; token must be unlocked and unfrozen. |
| `admin_update_image_uri` | `admin`             | Contract admin; token must be unlocked and unfrozen. |
| `freeze_metadata`      | `owner`               | Must be the current owner.                         |
| `lock_nft`             | `owner`               | Must be the current owner.                         |
| `unlock_nft`           | `owner`               | Must be the current owner.                         |
| `balance_of`           | —                     | View only; no auth required.                       |
| `total_supply`         | —                     | View only; no auth required.                       |
| `get_owner`            | —                     | View only; no auth required.                       |
| `get_nft_uri`          | —                     | View only; no auth required.                       |
| `get_nft_minter`       | —                     | View only; no auth required.                       |
| `get_player_nfts`      | —                     | View only; no auth required.                       |
| `get_player_nfts_page` | —                     | View only; no auth required.                       |

All auth checks use `soroban_sdk::Address::require_auth()`, which enforces the Soroban auth framework (signature verification, nonce replay protection).

---

## Error Behaviour

This contract does not define a formal `NftError` enum. Errors are surfaced as host-level panics (contract abort). The table below maps each panic condition to the entry point(s) that trigger it and the panic message used in the source.

| Condition                                      | Affected entry points                                     | Panic message / behaviour                           |
|------------------------------------------------|-----------------------------------------------------------|-----------------------------------------------------|
| Token does not exist (already burned)          | `transfer`, `burn`                                        | `"nft does not exist"` (via `.expect(...)`)         |
| Caller is not the current owner                | `transfer` (`from` check), `burn` (`owner` check), `update_nft_metadata` | `"not owner"` (via `assert_eq!`)    |
| URI is empty                                   | `mint_reward_nft_from_map`, `update_nft_metadata`         | panics with empty-URI message                       |
| URI scheme is not `ipfs://` or `https://`      | `mint_reward_nft_from_map`, `update_nft_metadata`         | panics with invalid-scheme message                  |
| Token is locked                                | `update_nft_metadata`, `admin_update_image_uri`           | panics with locked message                          |
| Token is frozen                                | `update_nft_metadata`, `admin_update_image_uri`           | panics with frozen message (irrecoverable)          |
| Owner-index corruption (slot missing)          | internal `remove_nft_from_owner`                          | `"index corruption: slot missing"` / `"exist-key set but slot not found"` — should never occur in normal operation |

> **Note:** A future iteration of this contract may replace panics with a typed `NftError` enum returned as a `Result` for cleaner client-side error handling.

---

## Events

| Event name  | Topics                              | Data     | Emitted by  |
|-------------|-------------------------------------|----------|-------------|
| `mint`      | `("mint", recipient: Address)`      | `nft_id: u64` | `mint`, `mint_reward_nft_from_map` |
| `transfer`  | `("transfer", from: Address, to: Address)` | `nft_id: u64` | `transfer` |
| `burn`      | `("burn", owner: Address)`          | `nft_id: u64` | `burn`      |

Events are published via `env.events().publish(topics, data)` and can be observed through Soroban RPC event streaming.

---

## Storage Layout

All data is stored in `env.storage().persistent()`. No temporary or instance storage is used.

### NFT metadata keys

| Storage key              | Value type | Description                                       |
|--------------------------|------------|---------------------------------------------------|
| `("NFTU", nft_id: u64)`  | `String`   | Metadata URI for the token (`ipfs://` or `https://`). |
| `("NFTM", nft_id: u64)`  | `Address`  | Original minter of the token.                     |
| `("NFTO", nft_id: u64)`  | `Address`  | Current owner of the token. Removed on burn.      |

### Global counter

| Storage key  | Value type | Description                                                   |
|--------------|------------|---------------------------------------------------------------|
| `"TOTAL"`    | `u64`      | Monotonically increasing total-supply counter. Never decremented. |

### Per-owner enumerable index

Three keys compose the owner NFT index. All are stored in `persistent()`.

| Storage key                             | Value type | Description                                                 |
|-----------------------------------------|------------|-------------------------------------------------------------|
| `("ONFC", owner: Address)`              | `u32`      | Number of NFTs currently owned by `owner`.                  |
| `("ONFX", owner: Address, nft_id: u64)` | `bool`     | Existence sentinel: `true` when `owner` holds `nft_id`.     |
| `("ONFT", owner: Address, slot: u32)`   | `u64`      | NFT id stored at `slot` index (0-based) in `owner`'s list.  |

#### Swap-and-pop removal

The enumerable list is kept compact without gaps. When an NFT is removed from an owner's index:

1. Find the slot `i` holding `nft_id` by scanning `ONFT` slots.
2. Move the last slot's value (`ONFT[last]`) into slot `i`.
3. Delete the last slot entry.
4. Delete the `ONFX` existence key for `nft_id`.
5. Decrement `ONFC`.

This keeps all lookups O(n) while avoiding holes in the slot array. The invariants maintained are:

- `ONFC` always equals the number of live `ONFT` slots.
- Every `ONFX` key for `owner` has exactly one corresponding `ONFT` slot.
- No `ONFX` key remains for a removed `nft_id`.

### Metadata guard keys

| Storage key                             | Value type | Description                                                        |
|-----------------------------------------|------------|--------------------------------------------------------------------|
| `("NFTL", nft_id: u64)`                 | `bool`     | Lock flag. `true` = metadata updates blocked (reversible).         |
| `("NFTF", nft_id: u64)`                 | `bool`     | Freeze flag. `true` = metadata updates permanently blocked.        |

---

## Building and Testing

Requires the Rust toolchain with the `wasm32-unknown-unknown` target.

```bash
# Build the contract WASM
cargo build --target wasm32-unknown-unknown --release

# Run all unit tests (host-side, no WASM)
cargo test

# Run tests with the soroban testutils feature
cargo test --features testutils
```

Test snapshots are stored in `test_snapshots/` and are used by the Soroban SDK's snapshot-testing infrastructure to detect unintended changes to ledger state or auth patterns.
