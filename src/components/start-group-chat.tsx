import { identity } from "@deso-core/identity";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Input,
} from "@material-tailwind/react";
import { UserContext } from "contexts/UserContext";
import uniq from "lodash/uniq";
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
import {
  encryptAccessGroupPrivateKeyToMemberDefaultKey,
  encryptAndSendNewMessage,
  getAccessGroupStandardDerivation,
} from "../services/crypto.service";
import { desoAPI } from "../services/deso.service";
import { MessagingDisplayAvatar } from "./messaging-display-avatar";
import { SearchUsers } from "./search-users";

export interface StartGroupChatProps {
  onSuccess: (pubKey: string) => void;
}

export const StartGroupChat = ({ onSuccess }: StartGroupChatProps) => {
  const { appUser } = useContext(UserContext);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [chatName, setChatName] = useState<string>("");
  const { members, addMember, removeMember, onPairMissing } = useMembers(
    setLoading,
    open
  );
  const membersAreaRef = useRef<HTMLDivElement>(null);

  const handleOpen = () => setOpen(!open);

  useEffect(() => {
    if (!open) {
      setChatName("");
    }
  }, [open]);

  const formSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const isInputValid = chatName && chatName.trim();
    if (!isInputValid) {
      toast.error("Chat name must be provided");
    }

    const areMembersDefined = Array.isArray(members) && members.length > 0;
    if (!areMembersDefined) {
      toast.error("At least one member should be added");
    }

    const formValid = isInputValid && areMembersDefined;
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
    if (!appUser?.primaryDerivedKey?.derivedSeedHex) {
      toast.error("You must be logged in to start a group chat.");
      return;
    }

    setLoading(true);

    try {
      // TODO: replace this derivation thing with the lib
      const accessGroupDerivation = getAccessGroupStandardDerivation(
        appUser.primaryDerivedKey.messagingPublicKeyBase58Check,
        groupName
      );

      const createGroupTx = await desoAPI.accessGroup.CreateAccessGroup(
        {
          AccessGroupKeyName: groupName,
          AccessGroupOwnerPublicKeyBase58Check: appUser.PublicKeyBase58Check,
          AccessGroupPublicKeyBase58Check:
            accessGroupDerivation.AccessGroupPublicKeyBase58Check,
          MinFeeRateNanosPerKB: 1000,
        },
        {
          broadcast: false,
        }
      );

      await identity.signAndSubmit(createGroupTx);

      const groupMembersArray = uniq(
        [...memberKeys, appUser.PublicKeyBase58Check].filter((key) => !!key)
      );

      const { AccessGroupEntries, PairsNotFound } =
        await desoAPI.accessGroup.GetBulkAccessGroupEntries({
          GroupOwnerAndGroupKeyNamePairs: groupMembersArray.map((key) => ({
            GroupOwnerPublicKeyBase58Check: key,
            GroupKeyName: "default-key",
          })),
        });

      if (PairsNotFound?.length) {
        onPairMissing();
        return;
      }

      const addGroupMembersTx = await desoAPI.accessGroup.AddAccessGroupMembers(
        {
          AccessGroupOwnerPublicKeyBase58Check: appUser.PublicKeyBase58Check,
          AccessGroupKeyName: groupName,
          AccessGroupMemberList: AccessGroupEntries.map((accessGroupEntry) => {
            return {
              AccessGroupMemberPublicKeyBase58Check:
                accessGroupEntry.AccessGroupOwnerPublicKeyBase58Check,
              AccessGroupMemberKeyName: accessGroupEntry.AccessGroupKeyName,
              EncryptedKey: encryptAccessGroupPrivateKeyToMemberDefaultKey(
                accessGroupEntry.AccessGroupPublicKeyBase58Check,
                accessGroupDerivation.AccessGroupPrivateKeyHex
              ),
            };
          }),
          MinFeeRateNanosPerKB: 1000,
        },
        {
          broadcast: false,
        }
      );

      await identity.signAndSubmit(addGroupMembersTx);

      // And we'll send a message just so it pops up for convenience
      await encryptAndSendNewMessage(
        `Hi. This is my first message to "${groupName}"`,
        appUser,
        appUser.PublicKeyBase58Check,
        accessGroupDerivation.AccessGroupKeyName
      );

      return `${appUser.PublicKeyBase58Check}${accessGroupDerivation.AccessGroupKeyName}`;
    } catch {
      toast.error(
        "something went wrong while submitting the add members transaction"
      );
    }

    setLoading(false);
  };

  return (
    <Fragment>
      <div className="flex text-lg items-center p-4 border-b border-blue-800/30 justify-between">
        <h2 className="font-semibold text-xl text-white">My Chat</h2>

        <Button
          onClick={handleOpen}
          className="bg-[#ffda59] text-[#6d4800] rounded-full py-2 hover:shadow-none normal-case text-sm px-4"
          size="md"
        >
          <div className="flex items-center ">
            <span className="mr-2">New Group Chat</span>
          </div>
        </Button>
      </div>

      <Dialog
        open={open}
        handler={handleOpen}
        className="bg-[#050e1d] text-blue-100 border border-gray-900 min-w-none max-w-none w-[90%] md:w-[40%]"
      >
        <DialogHeader className="text-blue-100">
          Start New Group Chat
        </DialogHeader>

        <form name="start-group-chat-form" onSubmit={formSubmit}>
          <DialogBody divider>
            <div className="mb-8">
              <div className="text-lg font-semibold mb-2 text-blue-100">
                Chat details
              </div>

              <Input
                label="Chat Name"
                value={chatName}
                onChange={(e) => setChatName(e.target.value)}
                className="text-blue-100 bg-blue-900/20"
              />
            </div>

            <div className="mb-4">
              <SearchUsers
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
              />

              <div
                className="max-h-[240px] overflow-y-auto custom-scrollbar"
                ref={membersAreaRef}
              >
                {members.map((member) => (
                  <div
                    className="flex p-2 items-center cursor-pointer text-white bg-blue-900/20 border border-gray-400 rounded-md my-2"
                    key={member.id}
                  >
                    <MessagingDisplayAvatar
                      username={member.text}
                      publicKey={member.id}
                      diameter={50}
                      classNames="mx-0"
                    />
                    <div className="flex justify-between align-center flex-1 text-blue-100">
                      <span className="ml-4 font-medium">{member.text}</span>
                      <Button
                        size="sm"
                        color="red"
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
              variant="text"
              color="red"
              onClick={handleOpen}
              className="mr-1"
            >
              <span>Cancel</span>
            </Button>
            <Button
              variant="gradient"
              color="green"
              type="submit"
              className="flex items-center"
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
