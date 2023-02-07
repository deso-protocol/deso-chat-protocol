import {
  AccessGroupEntryResponse,
  DerivedPrivateUserInfo,
} from "deso-protocol-types";
import {
  DEFAULT_KEY_IDENTITY_MESSAGING_OPERATION,
  DERIVED_SEED_HEX,
  localStorageKeys,
} from "./constants";

//derive
export const setDerivedKeyResponse = (
  payload: Partial<DerivedPrivateUserInfo>,
  ownerPublicKey: string
) => {
  localStorage.setItem(
    `${DERIVED_SEED_HEX}_${ownerPublicKey}`,
    JSON.stringify(payload)
  );
};
export const getDerivedKeyResponse = (
  ownerPublicKey: string
): Partial<DerivedPrivateUserInfo> => {
  return (
    JSON.parse(
      localStorage.getItem(`${DERIVED_SEED_HEX}_${ownerPublicKey}`) as string
    ) ?? {
      derivedPublicKeyBase58Check: "",
      derivedSeedHex: "",
      transactionSpendingLimitHex: "",
      accessSignature: "",
      messagingPublicKeyBase58Check: "",
      messagingPrivateKey: "",
      messagingKeyName: "",
    }
  );
};

// Used to be MessagingGroupEntryResponse
export const setDefaultKey = (defaultKey: AccessGroupEntryResponse) => {
  localStorage.setItem(
    DEFAULT_KEY_IDENTITY_MESSAGING_OPERATION,
    JSON.stringify(defaultKey)
  );
};

export const clearAllState = (userKey: string) => {
  // lazy way of waiting for useStates to finish first
  localStorageKeys.forEach((key) => {
    localStorage.removeItem(key);
  });

  localStorage.removeItem(`${DERIVED_SEED_HEX}_${userKey}`);
};
