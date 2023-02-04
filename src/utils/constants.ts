import { DeSoNetwork, TransactionSpendingLimitResponse } from "deso-protocol-types";

export const getTransactionSpendingLimits =
  (publicKey: string): TransactionSpendingLimitResponse => {
    return {
      GlobalDESOLimit: 100 * 1e9,
      TransactionCountLimitMap: {
        AUTHORIZE_DERIVED_KEY: 1,
        NEW_MESSAGE: LIMIT,
      },
      AccessGroupLimitMap: [{
        AccessGroupOwnerPublicKeyBase58Check: publicKey,
        ScopeType: "Any",
        AccessGroupKeyName: "",
        OperationType: "Any",
        OpCount: LIMIT,
      }],
      AccessGroupMemberLimitMap: [{
        AccessGroupOwnerPublicKeyBase58Check: publicKey,
        ScopeType: "Any",
        AccessGroupKeyName: "",
        OperationType: "Any",
        OpCount: LIMIT,
      }]
      // We can flip back to IsUnlimited if we prefer it
      // IsUnlimited: true,
    };
  };
export const USER_TO_SEND_MESSAGE_TO: Readonly<string> =
  'tBCKW665XZnvVZcCfcEmyeecSZGKAdaxwV2SH9UFab6PpSRikg4EJ2';
export const DERIVED_SEED_HEX: Readonly<string> = 'derivedSeedHex';
export const DEFAULT_KEY_IDENTITY_MESSAGING_OPERATION: Readonly<string> =
  'defaultKey';
export const DEFAULT_KEY_MESSAGING_GROUP_NAME: Readonly<string> = 'default-key';
export const LIMIT: Readonly<number> = 1_000_000_000_000;
export const localStorageKeys: Readonly<string>[] = [
  DEFAULT_KEY_MESSAGING_GROUP_NAME,
  DEFAULT_KEY_IDENTITY_MESSAGING_OPERATION,
  DERIVED_SEED_HEX,
];
export const IS_MAINNET: Readonly<boolean> = process.env.REACT_APP_IS_TESTNET !== "true";
export const DESO_NETWORK: Readonly<DeSoNetwork> = IS_MAINNET ? DeSoNetwork.mainnet : DeSoNetwork.testnet;
export const PUBLIC_KEY_LENGTH: Readonly<number> = IS_MAINNET ? 55 : 54;
export const PUBLIC_KEY_PREFIX: Readonly<string> = IS_MAINNET ? "BC" : "tBC";
export const MESSAGES_ONE_REQUEST_LIMIT = 100;
export const MAX_MEMBERS_IN_GROUP_SUMMARY_SHOWN = 4;
export const MAX_MEMBERS_TO_REQUEST_IN_GROUP = 50;
export const MOBILE_WIDTH_BREAKPOINT = 768;
