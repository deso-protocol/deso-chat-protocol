import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@material-tailwind/react";
import { UserContext } from "contexts/UserContext";
import {
  AccessGroupEntryResponse,
  AccessGroupPrivateInfo,
  addAccessGroupMembers,
  encrypt,
  getAllAccessGroupsMemberOnly,
  getBulkAccessGroups,
  identity,
  publicKeyToBase58Check,
  removeAccessGroupMembers,
  waitForTransactionFound,
} from "deso-protocol";
import difference from "lodash/difference";
import React, { Fragment, useContext, useRef, useState } from "react";
import { IoCloseCircleOutline, IoPeopleCircleOutline } from "react-icons/io5";
import ClipLoader from "react-spinners/ClipLoader";
import { toast } from "react-toastify";
import useKeyDown from "../hooks/useKeyDown";
import { useMembers } from "../hooks/useMembers";
import { useMobile } from "../hooks/useMobile";
import { DEFAULT_KEY_MESSAGING_GROUP_NAME } from "../utils/constants";
import { Conversation } from "../utils/types";
import { MessagingDisplayAvatar } from "./messaging-display-avatar";
import { SearchUsers } from "./search-users";

export interface ManageMembersDialogProps {
  onSuccess: () => void;
  conversation: Conversation;
  isGroupOwner: boolean;
}

export const ManageMembersDialog = ({
  onSuccess,
  conversation,
  isGroupOwner,
}: ManageMembersDialogProps) => {
  const { appUser } = useContext(UserContext);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const { members, addMember, removeMember, onPairMissing, currentMemberKeys } =
    useMembers(setLoading, open, conversation);
  const membersAreaRef = useRef<HTMLDivElement>(null);
  const { isMobile } = useMobile();

  const handleOpen = () => setOpen(!open);
  const groupName = conversation.messages[0].RecipientInfo.AccessGroupKeyName;

  useKeyDown(() => {
    if (open) {
      setOpen(false);
    }
  }, ["Escape"]);

  const formSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const areMembersDefined = Array.isArray(members) && members.length > 0;
    if (!areMembersDefined) {
      toast.error("At least one member should be added");
      return;
    }

    const memberKeys = members.map((e) => e.id);
    const memberKeysToAdd = difference(memberKeys, currentMemberKeys);
    const memberKeysToRemove = currentMemberKeys.filter(
      (e) => !memberKeys.includes(e)
    );

    setUpdating(true);

    try {
      await addMembers(groupName, memberKeysToAdd);
      await removeMembers(groupName, memberKeysToRemove);
    } finally {
      setUpdating(false);
    }

    onSuccess();
    handleOpen();
  };

  // TODO: migrate this to the deso-protocol library as a convenience wrapper
  const addMembers = async (groupName: string, memberKeys: Array<string>) => {
    if (!appUser) {
      return Promise.reject(new Error("You are not logged in."));
    }
    return updateMembers(
      groupName,
      memberKeys,
      async (groupEntries?: Array<AccessGroupEntryResponse>) => {
        let accessGroupKeyInfo: AccessGroupPrivateInfo;
        // We first try to decrypt the group's private key that was encrypted to the group owner's
        // default key. This is safer than simply using the standard derivation since
        // the standard derivation could have been computed incorrectly. This way we know that
        // the new member will have the same encryption key as the rest of the group.
        try {
          const resp = await getAllAccessGroupsMemberOnly({
            PublicKeyBase58Check: appUser.PublicKeyBase58Check,
          });

          const encryptedKey = (resp.AccessGroupsMember ?? []).find(
            (accessGroupEntry) =>
              accessGroupEntry &&
              accessGroupEntry.AccessGroupOwnerPublicKeyBase58Check ===
                appUser.PublicKeyBase58Check &&
              accessGroupEntry.AccessGroupKeyName === groupName &&
              accessGroupEntry.AccessGroupMemberEntryResponse
          )?.AccessGroupMemberEntryResponse?.EncryptedKey;

          if (encryptedKey) {
            const keys = await identity.decryptAccessGroupKeyPair(encryptedKey);
            const pkBs58Check = await publicKeyToBase58Check(keys.public);

            accessGroupKeyInfo = {
              AccessGroupPublicKeyBase58Check: pkBs58Check,
              AccessGroupPrivateKeyHex: keys.seedHex,
              AccessGroupKeyName: groupName,
            };
          }
        } catch (e) {
          // If, for any reason, we fail to recover the group's private key
          // we will fall back to the standard derivation.
          accessGroupKeyInfo = await identity.accessGroupStandardDerivation(
            groupName
          );
        }

        const { submittedTransactionResponse } = await addAccessGroupMembers({
          AccessGroupOwnerPublicKeyBase58Check: appUser.PublicKeyBase58Check,
          AccessGroupKeyName: groupName,
          AccessGroupMemberList: await Promise.all(
            (groupEntries || []).map(async (accessGroupEntry) => {
              return {
                AccessGroupMemberPublicKeyBase58Check:
                  accessGroupEntry.AccessGroupOwnerPublicKeyBase58Check,
                AccessGroupMemberKeyName: accessGroupEntry.AccessGroupKeyName,
                EncryptedKey: await encrypt(
                  accessGroupEntry.AccessGroupPublicKeyBase58Check,
                  accessGroupKeyInfo.AccessGroupPrivateKeyHex
                ),
              };
            })
          ),
          MinFeeRateNanosPerKB: 1000,
        });

        if (!submittedTransactionResponse) {
          throw new Error(
            "Failed to submit transaction to add members to group."
          );
        }

        return waitForTransactionFound(submittedTransactionResponse.TxnHashHex);
      }
    );
  };

  const removeMembers = async (
    groupName: string,
    memberKeys: Array<string>
  ) => {
    if (!appUser) {
      toast.error("You are not logged in.");
      return;
    }

    return updateMembers(
      groupName,
      memberKeys,
      async (groupEntries?: Array<AccessGroupEntryResponse>) => {
        const { submittedTransactionResponse } = await removeAccessGroupMembers(
          {
            AccessGroupOwnerPublicKeyBase58Check: appUser.PublicKeyBase58Check,
            AccessGroupKeyName: groupName,
            AccessGroupMemberList: (groupEntries || []).map(
              (accessGroupEntry) => {
                return {
                  AccessGroupMemberPublicKeyBase58Check:
                    accessGroupEntry.AccessGroupOwnerPublicKeyBase58Check,
                  AccessGroupMemberKeyName: accessGroupEntry.AccessGroupKeyName,
                  EncryptedKey: "",
                };
              }
            ),
            MinFeeRateNanosPerKB: 1000,
          }
        );

        if (!submittedTransactionResponse) {
          throw new Error(
            "Failed to submit transaction to update group members."
          );
        }

        return waitForTransactionFound(submittedTransactionResponse.TxnHashHex);
      }
    );
  };

  const updateMembers = async (
    groupName: string,
    memberKeys: Array<string>,
    updateAction: (
      AccessGroupEntries?: Array<AccessGroupEntryResponse>
    ) => Promise<void>
  ) => {
    if (memberKeys.length === 0) {
      return Promise.resolve();
    }

    const { AccessGroupEntries, PairsNotFound } = await getBulkAccessGroups({
      GroupOwnerAndGroupKeyNamePairs: memberKeys.map((pubKey) => {
        return {
          GroupOwnerPublicKeyBase58Check: pubKey,
          GroupKeyName: DEFAULT_KEY_MESSAGING_GROUP_NAME,
        };
      }),
    });

    if (PairsNotFound?.length) {
      onPairMissing();
      return;
    }

    await updateAction(AccessGroupEntries).catch(() =>
      toast.error("Something went wrong while submitting the transaction")
    );
  };

  return (
    <Fragment>
      <Button
        onClick={handleOpen}
        className="text-blue-400 bg-transparent p-0 shadow-none hover:shadow-none flex items-center"
      >
        <IoPeopleCircleOutline className="mr-2 text-2xl" />
        <span className="hidden items-center md:flex capitalize font-medium text-base">
          View Members
        </span>
      </Button>

      <Dialog
        open={open}
        handler={handleOpen}
        dismiss={{
          enabled: false,
        }}
        className="bg-[#050e1d] text-blue-100 border border-blue-900 min-w-none max-w-none w-[90%] md:w-[40%]"
      >
        <DialogHeader className="text-blue-100 p-5 border-b border-blue-600/20">
          <div className="flex justify-between w-full items-center">
            <span>
              All Members (
              {loading ? (
                <ClipLoader color={"#0d3679"} loading={true} size={16} />
              ) : (
                currentMemberKeys.length
              )}
              )
            </span>
            <div className="text-sm text-right font-normal text-blue-300/60 flex">
              <div>
                <strong className="text-blue-300/80">Group Name</strong>
                <br />
                {groupName}
              </div>
              {!isGroupOwner && (
                <div className="pl-2">
                  <IoCloseCircleOutline
                    className="text-2xl cursor-pointer"
                    onClick={() => setOpen(false)}
                  ></IoCloseCircleOutline>
                </div>
              )}
            </div>
          </div>
        </DialogHeader>
        <form name="start-group-chat-form" onSubmit={formSubmit}>
          <DialogBody divider className="border-none p-5 pb-0">
            <div className="mb-0">
              {isGroupOwner && (
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
                />
              )}

              <div
                className="max-h-[400px] mt-3 pr-3 overflow-y-auto custom-scrollbar overflow-hidden"
                ref={membersAreaRef}
              >
                {loading ? (
                  <div className="text-center">
                    <ClipLoader
                      color={"#0d3679"}
                      loading={true}
                      size={44}
                      className="mt-4"
                    />
                  </div>
                ) : (
                  members.map((member) => (
                    <div
                      className="flex p-1.5 md:p-4 items-center cursor-pointer text-white bg-blue-900/20 border border-blue-600/20 rounded-md my-2"
                      key={member.id}
                    >
                      <MessagingDisplayAvatar
                        username={member.text}
                        publicKey={member.id}
                        diameter={isMobile ? 40 : 50}
                        classNames="mx-0"
                      />
                      <div className="flex justify-between items-center flex-1 overflow-auto">
                        <div className="mx-2 md:ml-4 max-w-[calc(100%-105px)]">
                          <div className="font-medium truncate">
                            {member.text}
                          </div>
                          {isGroupOwner &&
                            currentMemberKeys.includes(member.id) && (
                              <div className="text-xs md:text-sm text-blue-300/80 mt-1">
                                Already in the chat
                              </div>
                            )}
                        </div>
                        {isGroupOwner &&
                          member.id !== appUser?.PublicKeyBase58Check && (
                            <Button
                              size="sm"
                              className="rounded-full mr-1 md:mr-3 px-3 py-2 border text-white bg-red-400/20 hover:bg-red-400/30 border-red-600/60 shadow-none hover:shadow-none normal-case text-sm md:px-4"
                              onClick={() => removeMember(member.id)}
                            >
                              Remove
                            </Button>
                          )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </DialogBody>

          <DialogFooter className="border-t border-blue-600/20">
            {isGroupOwner && (
              <>
                <Button
                  onClick={handleOpen}
                  className="rounded-full mr-3 py-2 bg-transparent border border-blue-600/60 shadow-none hover:shadow-none normal-case text-sm px-4"
                >
                  <span>Cancel</span>
                </Button>
                <Button
                  type="submit"
                  className="bg-[#ffda59] text-[#6d4800] rounded-full py-2 hover:shadow-none normal-case text-sm px-4 flex items-center"
                  disabled={updating}
                >
                  {updating && (
                    <ClipLoader
                      color="white"
                      loading={true}
                      size={20}
                      className="mr-2"
                    />
                  )}
                  <span>Update Group</span>
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </Dialog>
    </Fragment>
  );
};
