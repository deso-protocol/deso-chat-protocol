import React, { useContext, useRef } from "react";
import { Fragment, useState } from "react";
import {
  Button,
  Dialog,
  DialogHeader,
  DialogBody,
  DialogFooter,
} from "@material-tailwind/react";
import { SearchUsers } from "./search-users";
import { MessagingDisplayAvatar } from "./messaging-display-avatar";
import { toast } from "react-toastify";
import { DesoContext } from "../contexts/desoContext";
import { AccessGroupEntryResponse, DerivedPrivateUserInfo } from "deso-protocol-types";
import ClipLoader from 'react-spinners/ClipLoader';
import difference from "lodash/difference";
import { encryptAccessGroupPrivateKeyToMemberDefaultKey } from "../services/crypto-utils.service";
import { useMembers } from "../hooks/useMembers";
import { Conversation } from "../utils/types";
import { checkTransactionCompleted, constructSignAndSubmitWithDerived } from "../services/backend.service";

export interface ManageMembersDialogProps {
  onSuccess: () => void,
  derivedResponse: Partial<DerivedPrivateUserInfo>,
  conversation: Conversation;
}

export const ManageMembersDialog = ({ onSuccess, derivedResponse, conversation }: ManageMembersDialogProps) => {
  const { deso } = useContext(DesoContext);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const {
    members,
    addMember,
    removeMember,
    onPairMissing,
    currentMemberKeys
  } = useMembers(setLoading, open, conversation);
  const membersAreaRef = useRef<HTMLDivElement>(null);

  const handleOpen = () => setOpen(!open);
  const groupName = conversation.messages[0].RecipientInfo.AccessGroupKeyName

  const formSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const areMembersDefined = Array.isArray(members) && members.length > 0;
    if (!areMembersDefined) {
      toast.error("At least one member should be added");
      return;
    }

    const memberKeys = members.map(e => e.id);
    const memberKeysToAdd = difference(memberKeys, currentMemberKeys);
    const memberKeysToRemove = currentMemberKeys.filter(e => !memberKeys.includes(e));

    setUpdating(true);

    try {
      await addMembers(groupName, memberKeysToAdd);
      await removeMembers(groupName, memberKeysToRemove);
    } finally {
      setUpdating(false);
    }

    onSuccess();
    handleOpen();
  }

  const addMembers = async (groupName: string, memberKeys: Array<string>) => {
    return updateMembers(groupName, memberKeys, async(groupEntries?: Array<AccessGroupEntryResponse>) => {
      const accessGroupDerivation = deso.utils.getAccessGroupStandardDerivation(derivedResponse.messagingPublicKeyBase58Check as string, groupName);

      const { SubmitTransactionResponse } = await constructSignAndSubmitWithDerived(
        deso,
        deso.accessGroup.AddAccessGroupMembers({
          AccessGroupOwnerPublicKeyBase58Check: deso.identity.getUserKey() as string,
          AccessGroupKeyName: groupName,
          AccessGroupMemberList: (groupEntries || []).map((accessGroupEntry) => {
            return {
              AccessGroupMemberPublicKeyBase58Check: accessGroupEntry.AccessGroupOwnerPublicKeyBase58Check,
              AccessGroupMemberKeyName: accessGroupEntry.AccessGroupKeyName,
              EncryptedKey: encryptAccessGroupPrivateKeyToMemberDefaultKey(
                accessGroupEntry.AccessGroupPublicKeyBase58Check,
                accessGroupDerivation.AccessGroupPrivateKeyHex,
              ),
            }
          }),
          MinFeeRateNanosPerKB: 1000,
        }, {
          broadcast: false,
        }),
        derivedResponse.derivedSeedHex as string,
      );

      return checkTransactionCompleted(deso, SubmitTransactionResponse.TxnHashHex);
    });
  }

  const removeMembers = async (groupName: string, memberKeys: Array<string>) => {
    return updateMembers(groupName, memberKeys, async(groupEntries?: Array<AccessGroupEntryResponse>) => {
      const { SubmitTransactionResponse } = await constructSignAndSubmitWithDerived(
        deso,
        deso.accessGroup.RemoveAccessGroupMembers({
          AccessGroupOwnerPublicKeyBase58Check: deso.identity.getUserKey() as string,
          AccessGroupKeyName: groupName,
          AccessGroupMemberList: (groupEntries || []).map((accessGroupEntry) => {
            return {
              AccessGroupMemberPublicKeyBase58Check: accessGroupEntry.AccessGroupOwnerPublicKeyBase58Check,
              AccessGroupMemberKeyName: accessGroupEntry.AccessGroupKeyName,
              EncryptedKey: '',
            }
          }),
          MinFeeRateNanosPerKB: 1000,
        },{
          broadcast: false,
        }),
        derivedResponse.derivedSeedHex as string
      );

      return checkTransactionCompleted(deso, SubmitTransactionResponse.TxnHashHex);
    });
  }

  const updateMembers = async (
    groupName: string,
    memberKeys: Array<string>,
    updateAction: (AccessGroupEntries?: Array<AccessGroupEntryResponse>) => Promise<void>
  ) => {
    if (memberKeys.length === 0) {
      return Promise.resolve();
    }

    const { AccessGroupEntries, PairsNotFound } = await deso.accessGroup.GetBulkAccessGroupEntries({
      GroupOwnerAndGroupKeyNamePairs: memberKeys.map((pubKey) => {
        return { GroupOwnerPublicKeyBase58Check: pubKey, GroupKeyName: "default-key" }
      })
    });

    if (PairsNotFound?.length) {
      onPairMissing();
      return;
    }

    await updateAction(AccessGroupEntries)
      .catch(() => toast.error("Something went wrong while submitting the transaction"));
  }

  return (
    <Fragment>
      <Button
        onClick={handleOpen}
        className='bg-blue-700/40 hover:bg-blue-700/70 relative z-10 text-white rounded-full hover:shadow-none normal-case text-xs shadow-none px-3 py-1 md:px-6 md:py-3'
      >
        <span className="hidden md:block">Manage Members</span>
        <img className="visible md:hidden" src="/assets/members.png" alt="manage-members" width={24} />
      </Button>

      <Dialog open={open} handler={handleOpen} className="bg-[#050e1d] text-blue-100 border border-blue-900 min-w-none max-w-none w-[90%] md:w-[40%]">
        <DialogHeader className="text-blue-100">Manage members</DialogHeader>

        <form name="start-group-chat-form" onSubmit={formSubmit}>
          <DialogBody divider>
            <div className="mb-4">
              <div className="mb-8">
                <div className="mb-2 text-blue-100">
                  Chat:{" "}
                  <span className="font-semibold">{groupName}</span>
                </div>

                <div className="mb-2 text-blue-100">
                  Current participants:{" "}
                  <span className="font-semibold">
                    {
                      loading
                        ? <ClipLoader color={'#6d4800'} loading={true} size={16} />
                        : currentMemberKeys.length
                    }
                  </span>
                </div>
              </div>

              <SearchUsers
                deso={deso}
                onSelected={member => addMember(member, () => {
                  setTimeout(() => {
                    membersAreaRef.current?.scrollTo(0, membersAreaRef.current.scrollHeight);
                  }, 0);
                })}
              />

              <div className="max-h-[240px] overflow-y-auto custom-scrollbar" ref={membersAreaRef}>
                {
                  loading
                    ? (
                      <div className="text-center">
                        <ClipLoader color={'#6d4800'} loading={true} size={44} className="mt-4" />
                      </div>
                    )
                    : (
                      members.map((member) => (
                        <div
                          className="flex p-2 items-center cursor-pointer bg-blue-900/20 border text-white border-gray-400 rounded-md my-2"
                          key={member.id}
                        >
                          <MessagingDisplayAvatar
                            username={member.text}
                            publicKey={member.id}
                            diameter={50}
                            classNames="mx-0"
                          />
                          <div className="flex justify-between align-center flex-1">
                            <div className="ml-4">
                              <div className="font-medium">{member.text}</div>
                              {
                                currentMemberKeys.includes(member.id) && (
                                  <div className="text-xs">Already in the chat</div>
                                )
                              }
                            </div>
                            {member.id !== deso.identity.getUserKey() && (
                              <Button size="sm" color="red" onClick={() => removeMember(member.id)}>Remove</Button>
                            )}
                          </div>
                        </div>
                      ))
                    )
                }
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
            <Button variant="gradient" color="green" type="submit" className="flex items-center" disabled={updating}>
              {
                updating && <ClipLoader color="white" loading={true} size={20} className="mr-2" />
              }
              <span>Update Group</span>
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </Fragment>
  );
}
