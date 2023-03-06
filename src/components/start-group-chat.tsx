import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@material-tailwind/react";
import { SearchUsers } from "components/search-users";
import { UserContext } from "contexts/UserContext";
import {
  addAccessGroupMembers,
  createAccessGroup,
  encrypt,
  getBulkAccessGroups,
  identity,
} from "deso-protocol";
import React, {
  Fragment,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import ClipLoader from "react-spinners/ClipLoader";
import { toast } from "react-toastify";
import { useMembers } from "../hooks/useMembers";
import { useMobile } from "../hooks/useMobile";
import { encryptAndSendNewMessage } from "../services/conversations.service";
import { DEFAULT_KEY_MESSAGING_GROUP_NAME } from "../utils/constants";
import { MessagingDisplayAvatar } from "./messaging-display-avatar";
import { MyInput } from "./form/my-input";
import useKeyDown from "../hooks/useKeyDown";

export interface StartGroupChatProps {
  onSuccess: (pubKey: string) => void;
}

export const StartGroupChat = ({ onSuccess }: StartGroupChatProps) => {
  const { appUser } = useContext(UserContext);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [chatName, setChatName] = useState<string>("");
  const [formTouched, setFormTouched] = useState<boolean>(false);
  const { members, addMember, removeMember, onPairMissing } = useMembers(
    setLoading,
    open
  );
  const membersAreaRef = useRef<HTMLDivElement>(null);
  const { isMobile } = useMobile();

  const handleOpen = () => setOpen(!open);

  useKeyDown(() => {
    if (open) {
      setOpen(false);
    }
  }, ["Escape"]);

  useEffect(() => {
    if (!open) {
      setChatName("");
      setFormTouched(false);
    }
  }, [open]);

  const isNameValid = () => {
    return chatName && chatName.trim();
  };

  const areMembersValid = () => {
    return Array.isArray(members) && members.length > 0;
  };

  const formSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    setFormTouched(true);

    const formValid = isNameValid() && areMembersValid();
    if (!formValid) {
      return;
    }

    const newGroupKey = await startGroupChat(
      chatName.trim(),
      members.map((e) => e.id)
    );
    if (newGroupKey) {
      onSuccess(newGroupKey);
    }
    handleOpen();
  };

  const startGroupChat = async (
    groupName: string,
    memberKeys: Array<string>
  ) => {
    if (!appUser) {
      toast.error("You must be logged in to start a group chat.");
      return;
    }

    setLoading(true);

    // TODO: maybe we should wrap all this up under a single convenience function in the deso-protocol package.
    try {
      const accessGroupKeys = await identity.accessGroupStandardDerivation(
        groupName
      );

      await createAccessGroup({
        AccessGroupKeyName: groupName,
        AccessGroupOwnerPublicKeyBase58Check: appUser.PublicKeyBase58Check,
        AccessGroupPublicKeyBase58Check:
          accessGroupKeys.AccessGroupPublicKeyBase58Check,
        MinFeeRateNanosPerKB: 1000,
      });

      const groupMembersArray = Array.from(
        new Set([...memberKeys, appUser.PublicKeyBase58Check])
      );

      const { AccessGroupEntries, PairsNotFound } = await getBulkAccessGroups({
        GroupOwnerAndGroupKeyNamePairs: groupMembersArray.map((key) => ({
          GroupOwnerPublicKeyBase58Check: key,
          GroupKeyName: DEFAULT_KEY_MESSAGING_GROUP_NAME,
        })),
      });

      if (PairsNotFound?.length) {
        onPairMissing();
        return;
      }

      const groupMemberList = await Promise.all(
        AccessGroupEntries.map(async (accessGroupEntry) => {
          return {
            AccessGroupMemberPublicKeyBase58Check:
              accessGroupEntry.AccessGroupOwnerPublicKeyBase58Check,
            AccessGroupMemberKeyName: accessGroupEntry.AccessGroupKeyName,
            EncryptedKey: await encrypt(
              accessGroupEntry.AccessGroupPublicKeyBase58Check,
              accessGroupKeys.AccessGroupPrivateKeyHex
            ),
          };
        })
      );

      await addAccessGroupMembers({
        AccessGroupOwnerPublicKeyBase58Check: appUser.PublicKeyBase58Check,
        AccessGroupKeyName: groupName,
        AccessGroupMemberList: groupMemberList,
        MinFeeRateNanosPerKB: 1000,
      });

      // And we'll send a message just so it pops up for convenience
      // In this case we'll send it to ourselves. In most cases the
      // recipient will be a different user.
      await encryptAndSendNewMessage(
        `Hi. This is my first message to "${groupName}"`,
        appUser.PublicKeyBase58Check,
        appUser.PublicKeyBase58Check,
        groupName
      );

      return `${appUser.PublicKeyBase58Check}${accessGroupKeys.AccessGroupKeyName}`;
    } catch (e) {
      console.error(e);
      toast.error(
        "something went wrong while submitting the add members transaction"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Fragment>
      <div className="flex text-lg items-center p-4 py-3 h-[69px] border-b border-t border-blue-800/30 justify-between">
        <h2 className="font-semibold text-xl text-white">My Chat</h2>

        <Button
          onClick={handleOpen}
          className="bg-[#ffda59] text-[#6d4800] rounded-full py-2 hover:shadow-none normal-case text-sm px-4"
          size="md"
        >
          <div className="flex items-center ">
            <span>Create Chat</span>
          </div>
        </Button>
      </div>

      <Dialog
        open={open}
        handler={handleOpen}
        dismiss={{
          enabled: false,
        }}
        className="bg-[#050e1d] text-blue-100 border border-blue-900 min-w-none max-w-none w-[90%] md:w-[40%]"
      >
        <DialogHeader className="text-blue-100 p-5 border-b border-blue-600/20">
          Start New Group Chat
        </DialogHeader>

        <form name="start-group-chat-form" onSubmit={formSubmit}>
          <DialogBody divider className="border-none p-5">
            <div className="mb-4 md:mb-8">
              <MyInput
                label="Name"
                error={
                  formTouched && !isNameValid()
                    ? "Group name must be defined"
                    : ""
                }
                placeholder="Group name"
                value={chatName}
                setValue={setChatName}
              />
            </div>

            <div className="mb-4">
              <div className="text-lg font-semibold mb-2 text-blue-100">
                Add Users to Your Group Chat
              </div>
              <SearchUsers
                className="text-white placeholder:text-blue-100 bg-blue-900/20 placeholder-gray"
                onSelected={(member) =>
                  addMember(member, () => {
                    setTimeout(() => {
                      membersAreaRef.current?.scrollTo(
                        0,
                        membersAreaRef.current.scrollHeight
                      );
                    }, 0);
                  })
                }
                error={
                  formTouched && !areMembersValid()
                    ? "At least one memeber must be added"
                    : ""
                }
              />

              <div
                className="max-h-[400px] mt-1 pr-3 overflow-y-auto custom-scrollbar overflow-hidden"
                ref={membersAreaRef}
              >
                {members.map((member) => (
                  <div
                    className="flex p-1.5 md:p-4 items-center cursor-pointer text-white bg-blue-900/20 border border-blue-600/20 rounded-md my-2"
                    key={member.id}
                  >
                    <MessagingDisplayAvatar
                      username={member.text}
                      publicKey={member.id}
                      diameter={isMobile ? 40 : 44}
                      classNames="mx-0"
                    />
                    <div className="flex justify-between align-center flex-1 text-blue-100 overflow-auto">
                      <span className="mx-2 md:ml-4 font-medium truncate my-auto">
                        {member.text}
                      </span>
                      <Button
                        size="sm"
                        className="rounded-full mr-1 md:mr-3 px-3 py-2 border text-white bg-red-400/20 hover:bg-red-400/30 border-red-600/60 shadow-none hover:shadow-none normal-case text-sm md:px-4"
                        onClick={() => removeMember(member.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              onClick={handleOpen}
              className="rounded-full mr-3 py-2 bg-transparent border border-blue-600/60 shadow-none hover:shadow-none normal-case text-sm px-4"
            >
              <span>Cancel</span>
            </Button>
            <Button
              type="submit"
              className="bg-[#ffda59] text-[#6d4800] rounded-full py-2 hover:shadow-none normal-case text-sm px-4 flex items-center"
              disabled={loading}
            >
              {loading && (
                <ClipLoader
                  color="white"
                  loading={true}
                  size={20}
                  className="mr-2"
                />
              )}
              <span>Create Chat</span>
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </Fragment>
  );
};
