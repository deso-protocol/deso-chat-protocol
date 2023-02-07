import Deso from "deso-protocol";
import {
  AccessGroupEntryResponse,
  DerivedPrivateUserInfo,
} from "deso-protocol-types";
import { toast } from "react-toastify";
import {
  DEFAULT_KEY_MESSAGING_GROUP_NAME,
  getTransactionSpendingLimits,
  LIMIT,
} from "../utils/constants";
import {
  checkTransactionCompleted,
  constructSignAndSubmitWithDerived,
} from "./backend.service";

export const requestDerivedKey = async (
  deso: Deso
): Promise<Partial<DerivedPrivateUserInfo>> => {
  const {
    derivedSeedHex,
    derivedPublicKeyBase58Check,
    transactionSpendingLimitHex,
    accessSignature,
    expirationBlock,
    messagingPublicKeyBase58Check,
    messagingPrivateKey,
    messagingKeyName,
  } = await deso.identity
    .derive({
      publicKey: deso.identity.getUserKey() || undefined,
      transactionSpendingLimitResponse: getTransactionSpendingLimits(
        deso.identity.getUserKey() as string
      ),
      deleteKey: false,
      expirationDays: LIMIT,
    })
    .catch((e) => {
      toast.error(e);
      throw Error(e);
    });

  return {
    derivedPublicKeyBase58Check,
    derivedSeedHex,
    transactionSpendingLimitHex,
    accessSignature,
    expirationBlock,
    messagingPublicKeyBase58Check,
    messagingPrivateKey,
    messagingKeyName,
  };
};

export const authorizeDerivedKey = async (
  deso: Deso,
  derivedKeyResponse: Partial<DerivedPrivateUserInfo>
): Promise<void> => {
  const {
    derivedPublicKeyBase58Check,
    derivedSeedHex,
    transactionSpendingLimitHex,
    accessSignature,
    expirationBlock,
  } = derivedKeyResponse;
  if (!derivedPublicKeyBase58Check) {
    toast.error("need to create derived key first");
    return;
  }

  const authorizeDerivedKeyPromise =
    deso.user.authorizeDerivedKeyWithoutIdentity({
      OwnerPublicKeyBase58Check: deso.identity.getUserKey() as string,
      DerivedPublicKeyBase58Check: derivedPublicKeyBase58Check,
      AppName: "AppName",
      ExpirationBlock: expirationBlock,
      MinFeeRateNanosPerKB: 1000,
      TransactionSpendingLimitHex: transactionSpendingLimitHex,
      AccessSignature: accessSignature,
    });

  const { SubmitTransactionResponse } = await constructSignAndSubmitWithDerived(
    deso,
    authorizeDerivedKeyPromise,
    derivedSeedHex as string
  );

  return await checkTransactionCompleted(
    deso,
    SubmitTransactionResponse.TxnHashHex
  );
};

export const generateDefaultKey = async (
  deso: Deso,
  derivedKeyResponse: Partial<DerivedPrivateUserInfo>
): Promise<AccessGroupEntryResponse | undefined> => {
  let accessGroups = await deso.accessGroup.GetAllUserAccessGroupsOwned({
    PublicKeyBase58Check: deso.identity.getUserKey() as string,
  });

  const isDefaultKeyGroup = (x: AccessGroupEntryResponse) =>
    x.AccessGroupKeyName === DEFAULT_KEY_MESSAGING_GROUP_NAME;
  let defaultKey = accessGroups?.AccessGroupsOwned?.find(isDefaultKeyGroup);

  const { derivedSeedHex, messagingPublicKeyBase58Check } = derivedKeyResponse;
  if (defaultKey) {
    return defaultKey;
  }

  const constructCreateAccessGroupPromise = deso.accessGroup.CreateAccessGroup(
    {
      AccessGroupOwnerPublicKeyBase58Check:
        deso.identity.getUserKey() as string,
      AccessGroupPublicKeyBase58Check: messagingPublicKeyBase58Check,
      AccessGroupKeyName: DEFAULT_KEY_MESSAGING_GROUP_NAME,
      MinFeeRateNanosPerKB: 1000,
    },
    {
      broadcast: false,
    }
  );

  await constructSignAndSubmitWithDerived(
    deso,
    constructCreateAccessGroupPromise,
    derivedSeedHex as string
  );

  accessGroups = await deso.accessGroup.GetAllUserAccessGroupsOwned({
    PublicKeyBase58Check: deso.identity.getUserKey() as string,
  });

  defaultKey = accessGroups?.AccessGroupsOwned?.find(isDefaultKeyGroup);
  return defaultKey;
};
