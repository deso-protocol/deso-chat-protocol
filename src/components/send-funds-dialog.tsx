import {
  Button,
  Dialog,
  DialogBody,
  DialogHeader,
} from "@material-tailwind/react";
import { AppUser } from "contexts/UserContext";
import { identity } from "deso-protocol";
import { Fragment } from "react";
import { desoNanosToDeso } from "../utils/helpers";
import { shortenLongWord } from "./search-users";
import { AlertNotification } from "./shared/alert-notification";
import { SaveToClipboard } from "./shared/save-to-clipboard";

export interface StartGroupChatProps {
  appUser: AppUser;
  onClose: () => void;
}

export const SendFundsDialog = ({ appUser, onClose }: StartGroupChatProps) => {
  const formSubmit = () => {
    alert("form submitted");
  };
  return (
    <Fragment>
      <Dialog
        open={true}
        handler={onClose}
        className="bg-[#050e1d] text-blue-100 border border-blue-900 min-w-none max-w-none w-[90%] md:w-[40%] max-h-[95%] overflow-y-auto custom-scrollbar"
      >
        <DialogHeader className="text-blue-100">
          Get $DESO to get started
        </DialogHeader>

        <form name="start-group-chat-form" onSubmit={formSubmit}>
          <DialogBody divider>
            <AlertNotification type="info">
              <div className="break-words text-black text-center">
                No deso funds found for your address:
                <div>
                  <div className="bg-gray-700 text-white px-2 md:px-4 py-2 my-2 md:my-3 rounded mx-auto inline-block">
                    <SaveToClipboard text={appUser.PublicKeyBase58Check}>
                      {shortenLongWord(appUser.PublicKeyBase58Check, 8, 8)}
                    </SaveToClipboard>
                  </div>
                </div>
                Click &quot;Get $DESO&quot; button below to add some through
                phone verification. Otherwise you can send $DESO from another
                account.
              </div>
            </AlertNotification>

            <div className="text-[24px] text-center my-2 md:my-8 text-white">
              <span>
                Your Balance:{" "}
                <b>{desoNanosToDeso(appUser.BalanceNanos)} $DESO</b>
              </span>

              <div className="text-sm italic">
                We refresh your balance every 3 seconds.
              </div>

              <div className="mt-1 md:mt-2">
                <Button
                  size="sm"
                  variant="gradient"
                  onClick={() => identity.verifyPhoneNumber()}
                >
                  Get $DESO
                </Button>
              </div>
            </div>
          </DialogBody>
        </form>
      </Dialog>
    </Fragment>
  );
};
