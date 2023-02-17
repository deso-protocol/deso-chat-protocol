import {
  CreatorCoinLimitOperationString,
  DAOCoinLimitOperationString,
  DeSoNetwork,
  NFTLimitOperationString
} from "deso-protocol-types";
import { TransactionSpendingLimitResponseOptions } from "@deso-core/identity";

export const getTransactionSpendingLimits = (
  publicKey: string
): TransactionSpendingLimitResponseOptions => {
  return {
    GlobalDESOLimit: 5 * 1e9,
    TransactionCountLimitMap: {
      BASIC_TRANSFER: 10,
      BITCOIN_EXCHANGE: 10,
      PRIVATE_MESSAGE: 10,
      SUBMIT_POST: 10,
      UPDATE_PROFILE: 10,
      UPDATE_BITCOIN_USD_EXCHANGE_RATE: 10,
      FOLLOW: 10,
      LIKE: 10,
      CREATOR_COIN: 10, // this should never be in there, we should hide it if it is.
      SWAP_IDENTITY: 10,
      UPDATE_GLOBAL_PARAMS: 10,
      CREATOR_COIN_TRANSFER: 10,
      CREATE_NFT: 10,
      UPDATE_NFT: 10, // this should never be in there, we should hide it if it is.
      ACCEPT_NFT_BID: 10, // this should never be in there, we should hide it if it is.
      NFT_BID: 10, // this should never be in there, we should hide it if it is.
      NFT_TRANSFER: 10, // this should never be in there, we should hide it if it is.
      ACCEPT_NFT_TRANSFER: 10, // this should never be in there, we should hide it if it is.
      BURN_NFT: 10, // this should never be in there, we should hide it if it is.
      AUTHORIZE_DERIVED_KEY: 10,
      MESSAGING_GROUP: 10,
      DAO_COIN: 10, // this should never be in there, we should hide it if it is.
      DAO_COIN_TRANSFER: 10, // this should never be in there, we should hide it if it is.
      DAO_COIN_LIMIT_ORDER: 10, // this should never be in there, we should hide it if it is.
      CREATE_USER_ASSOCIATION: 10, // this should never be in there, we should hide it if it is.
      DELETE_USER_ASSOCIATION: 10, // this should never be in there, we should hide it if it is.
      CREATE_POST_ASSOCIATION: 10, // this should never be in there, we should hide it if it is.
      DELETE_POST_ASSOCIATION: 10, // this should never be in there, we should hide it if it is.
      ACCESS_GROUP: 10, // this should never be in there, we should hide it if it is.
      ACCESS_GROUP_MEMBERS: 10, // this should never be in there, we should hide it if it is.
      NEW_MESSAGE: UNLIMITED,
    },
    CreatorCoinOperationLimitMap: {
      [ninaPublicKey]: {
        [CreatorCoinLimitOperationString.BUY]: 2,
        [CreatorCoinLimitOperationString.SELL]: 2,
      },
      [meowbeamPublicKey]: {
        [CreatorCoinLimitOperationString.TRANSFER]: 2,
        [CreatorCoinLimitOperationString.ANY]: 2,
      },
      "": { // empty string means any public key
        [CreatorCoinLimitOperationString.BUY]: 2,
      }
    },
    DAOCoinOperationLimitMap: {
      [ninaPublicKey]: {
        [DAOCoinLimitOperationString.MINT]: 2,
        [DAOCoinLimitOperationString.BURN]: 2,
        [DAOCoinLimitOperationString.TRANSFER]: 2
      },
      [meowbeamPublicKey]: {
        [DAOCoinLimitOperationString.ANY]: 2,
        [DAOCoinLimitOperationString.UPDATE_TRANSFER_RESTRICTION_STATUS]: 2,
        [DAOCoinLimitOperationString.DISABLE_MINTING]: 1,
      },
      "": { // empty string means any public key
        [DAOCoinLimitOperationString.TRANSFER]: 2,
      }
    },
    NFTOperationLimitMap: {
      [nftPostHashHex]: { // NOTE: the numbers here are for serial numbers, not index
        0: { // NOTE: the serial number 0 means the specified actions can be taken on ANY serial number
          [NFTLimitOperationString.BID]: 2,
          [NFTLimitOperationString.UPDATE]: 2,
        },
        1: {
          [NFTLimitOperationString.ANY]: 2,
          [NFTLimitOperationString.BURN]: 2,
        },
        2: {
          [NFTLimitOperationString.TRANSFER]: 2,
          [NFTLimitOperationString.ACCEPT_BID]: 2,
          [NFTLimitOperationString.ACCEPT_TRANSFER]: 2,
        }
      },
      "": { //empty string for nft post hash hex means ANY NFT post
        0: {
          [NFTLimitOperationString.BID]: 10,
        }
      }
    },
    DAOCoinLimitOrderLimitMap: { // first string key is the public key of the buying coin, second public key is the selling coin
      [ninaPublicKey]: {
        [meowbeamPublicKey]: 2,
        "DESO": 2, // this string means the selling coin is DESO
      },
      "DESO": { // DESO is the buying coin
        [ninaPublicKey]: 2,
      }
    },
    AssociationLimitMap: [{
      AssociationClass: "Post",
      AppScopeType: "Scoped", // means SCOPED to app defined in app public key
      AppPublicKeyBase58Check: ninaPublicKey,
      AssociationType: "", // This means ANY value can be put in for association type
      AssociationOperation: "Create",
      OpCount: 2,
    }, {
      AssociationClass: "User",
      AppScopeType: "Any", // means you can create an association on any app
      AppPublicKeyBase58Check: "",
      AssociationType: "FOLLOW",
      AssociationOperation: "Any",
      OpCount: 2,
    }, {
      AssociationClass: "Post",
      AppScopeType: "Scoped",
      AppPublicKeyBase58Check: "", // means the global app namespace
      AssociationType: "REACTION",
      AssociationOperation: "Delete",
      OpCount: 2,
    }],
    AccessGroupLimitMap: [
      {
        AccessGroupOwnerPublicKeyBase58Check: publicKey,
        ScopeType: "Any", // Scoped to any app
        AccessGroupKeyName: "",
        OperationType: "Any",
        OpCount: UNLIMITED,
      },
      {
        AccessGroupOwnerPublicKeyBase58Check: publicKey,
        ScopeType: "Scoped", // scoped to the access group key name defined
        AccessGroupKeyName: "default-key",
        OperationType: "Create",
        OpCount: 1,
      },
      {
        AccessGroupOwnerPublicKeyBase58Check: publicKey,
        ScopeType: "Scoped",
        AccessGroupKeyName: "default-key",
        OperationType: "Update",
        OpCount: 2,
      }
    ],
    AccessGroupMemberLimitMap: [
      {
        AccessGroupOwnerPublicKeyBase58Check: publicKey,
        ScopeType: "Any",
        AccessGroupKeyName: "",
        OperationType: "Any",
        OpCount: UNLIMITED,
      },
      {
        AccessGroupOwnerPublicKeyBase58Check: publicKey,
        ScopeType: "Scoped", // scoped to the access group key name defined
        AccessGroupKeyName: "my-cool-group",
        OperationType: "Add",
        OpCount: 1,
      },
      {
        AccessGroupOwnerPublicKeyBase58Check: publicKey,
        ScopeType: "Scoped",
        AccessGroupKeyName: "my-cool-group",
        OperationType: "Remove",
        OpCount: 2,
      },
      {
        AccessGroupOwnerPublicKeyBase58Check: publicKey,
        ScopeType: "Scoped",
        AccessGroupKeyName: "my-cool-group",
        OperationType: "Update",
        OpCount: 2,
      }
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

const ninaPublicKey = IS_MAINNET ? "BC1YLhtBTFXAsKZgoaoYNW8mWAJWdfQjycheAeYjaX46azVrnZfJ94s" : "tBCKVv5H1Gz6RTRhjxJwdzcfwfwoUo8b4PYWSKkayG4dy76Jsjt2Ro";
const meowbeamPublicKey = IS_MAINNET ? "BC1YLgkMyk81iHJuLgSeDQrTX55hW64HRvqbpz25Sz677fgvjXiY9aG" : "tBCKVapwwkTTdgpfEKGphh5bGMvcU9aLJTqssRopKX7wQyzwGvoxGL";
const nftPostHashHex = IS_MAINNET ? "b1cf68f5eb829f8c6c42abe009f315ee921d46c91cc6bd3b9cab9dc4851addc1" : "4a20187fff34fc4b5b07d7cbf531ac4f08bba9e38ea32000b4513ba69759f6da";