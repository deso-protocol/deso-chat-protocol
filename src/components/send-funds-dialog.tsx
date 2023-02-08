import React, { useContext, useEffect } from "react";
import { Fragment, useState } from "react";
import {
  Button,
  Dialog,
  DialogHeader,
  DialogBody,
  DialogFooter,
} from "@material-tailwind/react";
import ClipLoader from "react-spinners/ClipLoader";
import { AlertNotification } from "./shared/alert-notification";
import { DesoContext } from "../contexts/desoContext";
import { shortenLongWord } from "./search-users";
import { SaveToClipboard } from "./shared/save-to-clipboard";
import { desoNanosToDeso } from "../utils/helpers";
import { pollUserBalanceNanos } from "../services/backend.service";

export interface StartGroupChatProps {
  onClose: () => void;
  onSubmit: () => void,
}

export const SendFundsDialog = ({ onSubmit, onClose }: StartGroupChatProps) => {
  const { deso } = useContext(DesoContext);

  const [loading, setLoading] = useState(false);
  const [balanceNanos, setBalanceNanos] = useState<number>(0);
  const [interval, setInterval] = useState<number>(0);

  const formSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    clearInterval(interval);
    setLoading(true);

    try {
      await onSubmit();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const intervalId = pollUserBalanceNanos(deso, setBalanceNanos);
    setInterval(intervalId);

    return () => clearInterval(interval);
  }, []);

  return (
    <Fragment>
      <Dialog open={true} handler={onClose} className="bg-[#050e1d] text-blue-100 border border-blue-900 min-w-none max-w-none w-[90%] md:w-[40%] max-h-[95%] overflow-y-auto custom-scrollbar">
        <DialogHeader className="text-blue-100">Get $DESO to get started</DialogHeader>

        <form name="start-group-chat-form" onSubmit={formSubmit}>
          <DialogBody divider>
            <AlertNotification type="info">
              <div className="break-words text-black text-center">
                No deso funds found for your address:

                <div>
                  <div className="bg-gray-700 text-white px-2 md:px-4 py-2 my-2 md:my-3 rounded mx-auto inline-block">
                    <SaveToClipboard text={deso.identity.getUserKey() || ""}>
                      {shortenLongWord(deso.identity.getUserKey(), 8, 8)}
                    </SaveToClipboard>
                  </div>
                </div>

                Click "Get $DESO" button below to add some through phone verification. Otherwise you can send $DESO from another account.
              </div>
            </AlertNotification>

            <div className="text-[24px] text-center my-2 md:my-8 text-white">
              <span>Your Balance: <b>{desoNanosToDeso(balanceNanos)} $DESO</b></span>

              <div className="text-sm italic">We refresh your balance every 3 seconds.</div>

              <div className="mt-1 md:mt-2">
                <Button size="sm" variant="gradient" onClick={async () => {
                  const key = deso.identity.getUserKey();

                  if (!key) {
                    return;
                  }

                  await deso.identity.phoneVerification('4', undefined, {
                    publicKey: key,
                  });
                }}>
                  Get $DESO
                </Button>
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              variant="text"
              color="red"
              onClick={onClose}
              className="mr-1"
            >
              <span>Cancel</span>
            </Button>

            <Button
              variant="gradient"
              color="green"
              type="submit"
              className="flex items-center"
              disabled={loading || balanceNanos === 0}
            >
              {
                loading && <ClipLoader color="white" loading={true} size={20} className="mr-2" />
              }
              <span>Setup Account</span>
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </Fragment>
  );
}
