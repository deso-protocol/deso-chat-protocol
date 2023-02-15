import { identity } from "@deso-core/identity";
import { Button } from "@material-tailwind/react";
import { UserContext } from "contexts/UserContext";
import { useContext, useState } from "react";
import ClipLoader from "react-spinners/ClipLoader";
import { toast } from "react-toastify";
import { desoAPI } from "services/desoAPI.service";
import { DEFAULT_KEY_MESSAGING_GROUP_NAME } from "utils/constants";
import { hasSetupMessaging } from "utils/helpers";
import { SendFundsDialog } from "./send-funds-dialog";
import { celebrate } from "../services/confetti.service";

export const MessagingSetupButton = () => {
  const { appUser, isLoadingUser, setAccessGroups, setAllAccessGroups } =
    useContext(UserContext);
  const [isSettingUpMessage, setIsSettingUpMessaging] =
    useState<boolean>(false);
  const [openDialog, setOpenDialog] = useState<boolean>(false);

  if (hasSetupMessaging(appUser)) {
    // this *should* never happen, but just in case...
    return <div>Something is wrong, your account is already set up.</div>;
  }

  if (isLoadingUser) {
    return (
      <div className="flex justify-center">
        <ClipLoader
          color={"#6d4800"}
          loading={true}
          size={44}
          className="mt-4"
        />
      </div>
    );
  }

  if (!appUser) {
    return (
      <Button
        size="lg"
        className="bg-[#ffda59] text-[#6d4800] rounded-full hover:shadow-none normal-case text-lg"
        onClick={async () => {
          await identity.login();
          if (identity.snapshot().currentUser?.publicKey === "BC1YLfhQ8scqfcEotsTVxjCeGEXPdKaK26fKZ6SdmnA9dRB9Qe3Go8b" || identity.snapshot().currentUser?.publicKey === "tBCKUpeA3to5i9jdn2pQmnt4dqR1e65xBQPUp7ZWnXxgN66qnyvnpt") {
            celebrate();
          }
        }}
      >
        Secure Login
      </Button>
    );
  }

  // TODO: we can probably just delete this since we changed the identity thing
  // to just force you to get $DESO.  we don't even have to deal with the
  // polling thing anymore... Leaving it here for now just in case, but it's
  // probably safe to delete which removes a lot of incidental complexity.
  if (appUser.BalanceNanos === 0) {
    return (
      <>
        <Button
          size="lg"
          variant="gradient"
          onClick={() => setOpenDialog(true)}
        >
          Get $DESO to get started
        </Button>
        {openDialog && (
          <SendFundsDialog
            appUser={appUser}
            onClose={() => setOpenDialog(false)}
          />
        )}
      </>
    );
  }

  return (
    <Button
      size="lg"
      variant="gradient"
      onClick={async () => {
        setIsSettingUpMessaging(true);
        try {
          const tx = await desoAPI.accessGroup.CreateAccessGroup(
            {
              AccessGroupOwnerPublicKeyBase58Check:
                appUser.PublicKeyBase58Check,
              AccessGroupPublicKeyBase58Check:
                appUser.messagingPublicKeyBase58Check,
              AccessGroupKeyName: DEFAULT_KEY_MESSAGING_GROUP_NAME,
              MinFeeRateNanosPerKB: 1000,
            },
            {
              broadcast: false,
            }
          );

          await identity.signAndSubmit(tx);

          const { AccessGroupsOwned, AccessGroupsMember } =
            await desoAPI.accessGroup.GetAllUserAccessGroups({
              PublicKeyBase58Check: appUser.PublicKeyBase58Check,
            });

          if (!AccessGroupsOwned) {
            throw new Error("did not get any access groups");
          }

          setAccessGroups(AccessGroupsOwned);
          setAllAccessGroups(
            AccessGroupsOwned.concat(AccessGroupsMember || [])
          );
        } catch (e: any) {
          toast.error("Something went wrong when setting up the account");
          console.error(e);
        }
        setIsSettingUpMessaging(false);
      }}
    >
      <div className="flex justify-center">
        {isSettingUpMessage ? (
          <ClipLoader color={"white"} loading={true} size={20} />
        ) : (
          <div className="mr-2">Setup account for messaging</div>
        )}
      </div>{" "}
    </Button>
  );
};
