import {
  DeSoNetwork,
  TransactionSpendingLimitResponseOptions,
} from "deso-protocol";

export const getTransactionSpendingLimits = (
  publicKey: string
): TransactionSpendingLimitResponseOptions => {
  return {
    GlobalDESOLimit: 5 * 1e9,
    TransactionCountLimitMap: {
      AUTHORIZE_DERIVED_KEY: 1,
      NEW_MESSAGE: UNLIMITED,
    },
    AccessGroupLimitMap: [
      {
        AccessGroupOwnerPublicKeyBase58Check: publicKey,
        ScopeType: "Any",
        AccessGroupKeyName: "",
        OperationType: "Any",
        OpCount: UNLIMITED,
      },
    ],
    AccessGroupMemberLimitMap: [
      {
        AccessGroupOwnerPublicKeyBase58Check: publicKey,
        ScopeType: "Any",
        AccessGroupKeyName: "",
        OperationType: "Any",
        OpCount: UNLIMITED,
      },
    ],
    // We can flip back to IsUnlimited if we prefer it
    // IsUnlimited: true,
  };
};
export const DEFAULT_KEY_MESSAGING_GROUP_NAME: Readonly<string> = "default-key";
export const IS_MAINNET: Readonly<boolean> =
  process.env.REACT_APP_IS_TESTNET !== "true";
export const USER_TO_SEND_MESSAGE_TO: Readonly<string> = IS_MAINNET
  ? "BC1YLgUCRPPtWmCwvigZay2Dip6ce1UHd2TqniZci8qgauCtUo8mQDW"
  : "tBCKW665XZnvVZcCfcEmyeecSZGKAdaxwV2SH9UFab6PpSRikg4EJ2";
export const DESO_NETWORK: Readonly<DeSoNetwork> = IS_MAINNET
  ? DeSoNetwork.mainnet
  : DeSoNetwork.testnet;
export const PUBLIC_KEY_LENGTH: Readonly<number> = IS_MAINNET ? 55 : 54;
export const PUBLIC_KEY_PREFIX: Readonly<string> = IS_MAINNET ? "BC" : "tBC";
export const MESSAGES_ONE_REQUEST_LIMIT = 25;
export const MAX_MEMBERS_IN_GROUP_SUMMARY_SHOWN = 4;
export const MAX_MEMBERS_TO_REQUEST_IN_GROUP = 50;
export const MOBILE_WIDTH_BREAKPOINT = 768;
export const REFRESH_MESSAGES_INTERVAL_MS = 5000;
export const REFRESH_MESSAGES_MOBILE_INTERVAL_MS = 20000;
export const BASE_TITLE = "DeSo Chat Protocol";
export const TITLE_DIVIDER = " · ";
const UNLIMITED = "UNLIMITED";
