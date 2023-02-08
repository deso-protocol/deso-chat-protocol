import { DerivedPrivateUserInfo } from 'deso-protocol-types';
import { FC, useContext, useEffect, useState } from 'react';
import ClipLoader from 'react-spinners/ClipLoader';
import { Button } from "@material-tailwind/react";
import { toast } from "react-toastify";
import { SendFundsDialog } from "./send-funds-dialog";
import { DesoContext } from "../contexts/desoContext";
import { authorizeDerivedKey, generateDefaultKey, requestDerivedKey } from "../services/derived-keys.service";
import { getDerivedKeyResponse, setDefaultKey, setDerivedKeyResponse } from "../utils/store";
import { getUserBalanceNanos, pollUserBalanceNanos } from "../services/backend.service";

export const MessagingSetupButton: FC<{
  setDerivedResponse: (d: Partial<DerivedPrivateUserInfo>) => void,
}> = ({ setDerivedResponse }) => {
  const { deso, setHasSetupAccount, setLoggedInPublicKey } = useContext(DesoContext);

  const [isSending, setIsSending] = useState<boolean>(false);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [openDialog, setOpenDialog] = useState<boolean>(false);
  const [balance, setBalance] = useState<number>(0);
  const [interval, setInterval] = useState<number>(0);
  const [loadedBalance, setLoadedBalance] = useState<boolean>(false);

  useEffect(() => {
    if (!deso.identity.getUserKey()) {
      setLoadedBalance(true);
      return;
    }
    getUserBalanceNanos(deso)
      .then((balance) => setBalance(balance))
      .finally(() => setLoadedBalance(true));
  }, [deso]);

  useEffect(() => {
    const intervalId = pollUserBalanceNanos(deso, setBalance);
    setInterval(intervalId);

    return () => clearInterval(intervalId);
  }, []);

  const login = async () => {
    setIsLoggingIn(true);

    try {
      // are they already logged in? if not prompt them
      const res = await deso.identity.login('1');
      const key = res.key;
      if (!key) {
        toast.error('Failed to login');
        return false;
      }
      setLoggedInPublicKey(key);
      const newBalance = await getUserBalanceNanos(deso, key);
      setBalance(newBalance);
      if (newBalance === 0) {
        setOpenDialog(true);
        return false;
      }
    } finally {
      setIsLoggingIn(false);
    }
  }

  const setupMessaging = async (): Promise<false | Partial<DerivedPrivateUserInfo>> => {
    let key = deso.identity.getUserKey();
    if (!key) {
      toast.error('You need to login first');
      return false;
    }

    let derivedResponse: Partial<DerivedPrivateUserInfo> =
      getDerivedKeyResponse(key); // does the derived key exist in storage already?
    if (!derivedResponse.derivedPublicKeyBase58Check) {
      // if not request one
      derivedResponse = await requestDerivedKey(deso);
    }
    if (!derivedResponse.derivedPublicKeyBase58Check) {
      toast.error('Failed to authorize derive key');
      return false;
    }
    setDerivedKeyResponse(derivedResponse, key);

    await authorizeDerivedKey(deso, derivedResponse);

    const defaultKeyGroup = await generateDefaultKey(deso, derivedResponse);
    if (defaultKeyGroup) {
      setDefaultKey(defaultKeyGroup);
    }
    setDerivedResponse(derivedResponse);
    setHasSetupAccount(true);

    return derivedResponse;
  };

  return (
    <div>
      {
        !loadedBalance
          ? <ClipLoader color={'#6d4800'} loading={true} size={44} className="mt-4" />
          : !deso.identity.getUserKey()
            ? (
              <Button
                size="lg"
                className='bg-[#ffda59] text-[#6d4800] rounded-full hover:shadow-none normal-case text-lg'
                onClick={login}
              >
                {isLoggingIn ? (
                  <ClipLoader color={'#6d4800'} loading={true} size={28} className="mx-2" />
                ) : (
                  <div className="mx-2">Secure Login</div>
                )}
              </Button>
            )
            : balance
              ? (
                <Button
                  size="lg"
                  className='bg-[#ffda59] text-[#6d4800] rounded-full hover:shadow-none normal-case text-lg'
                  onClick={async () => {
                    setIsSending(true);

                    try {
                      await setupMessaging();
                    } catch (e: any) {
                      toast.error('Something went wrong when setting up the account');
                      console.error(e);
                    } finally {
                      setIsSending(false);
                    }
                  }}
                >
                  <div className="flex justify-center">
                    {isSending ? (
                      <ClipLoader color={'#6d4800'} loading={true} size={28} className="mx-2" />
                    ) : (
                      <div className="mx-2">Setup account for messaging</div>
                    )}
                  </div>
                </Button>
              )
              : (
                <Button
                  size="lg"
                  className='bg-[#ffda59] text-[#6d4800] rounded-full hover:shadow-none normal-case text-lg'
                  onClick={() => setOpenDialog(true)}
                >
                  <div className="mx-2">
                    Get $DESO to get started
                  </div>
                </Button>
              )
      }


      {openDialog && (
        <SendFundsDialog
          onClose={() => setOpenDialog(false)}
          onSubmit={setupMessaging}
        />
      )}
    </div>
  );
};
