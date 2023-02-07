import Deso from "deso-protocol";
import { reject } from "lodash";
import { toast } from "react-toastify";
import {
  ConstructAndSubmitResponse,
  TransactionConstructionResponse,
} from "../utils/types";

export const checkTransactionCompleted = (
  deso: Deso,
  hashHex: string
): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(async () => {
      deso.transaction
        .getTransaction(hashHex)
        .then(({ TxnFound }) => {
          if (TxnFound) {
            resolve();
          } else {
            resolve(checkTransactionCompleted(deso, hashHex));
          }
        })
        .catch(() => reject("Error when getting transaction"));
    }, 150);
  });
};

export const getUserBalanceNanos = async (deso: Deso, key?: string) => {
  const userKey = key || deso.identity.getUserKey();

  if (!userKey) {
    toast.error("User has no public key registered");
    return Promise.resolve(0);
  }

  const userResponse = await deso.user.getUsersStateless({
    PublicKeysBase58Check: [userKey],
    SkipForLeaderboard: true,
    IncludeBalance: true,
    GetUnminedBalance: true,
  });
  const user = userResponse?.UserList?.[0];

  if (!user) {
    toast.error("Unable to find user");
    return Promise.reject();
  }

  return user.BalanceNanos;
};

export const pollUserBalanceNanos = (
  deso: Deso,
  setBalance: (balance: number) => void,
  timeout = 3000
): number => {
  return window.setInterval(async () => {
    const key = deso.identity.getUserKey();
    if (!key) {
      return;
    }

    const balance = await getUserBalanceNanos(deso, key);
    setBalance(balance);
  }, timeout);
};

export const constructSignAndSubmitWithDerived = async (
  deso: Deso,
  txnConstructionPromise: Promise<TransactionConstructionResponse>,
  derivedSeedHex: string
): Promise<ConstructAndSubmitResponse> => {
  const transactionConstructionResponse = await txnConstructionPromise;
  const transactionHex = transactionConstructionResponse.TransactionHex;
  if (!transactionHex) {
    return Promise.reject("Transaction construction failed");
  }

  const signedTransactionHex = deso.utils.signTransaction(
    derivedSeedHex,
    transactionHex,
    true
  );

  const submitTransactionResponse = await deso.transaction.submitTransaction(
    signedTransactionHex
  );

  return {
    TransactionConstructionResponse: transactionConstructionResponse,
    SubmitTransactionResponse: submitTransactionResponse,
  };
};
