import { UserContext } from "contexts/UserContext";
import {
  getBulkAccessGroups,
  getPaginatedAccessGroupMembers,
} from "deso-protocol";
import { useContext, useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  DEFAULT_KEY_MESSAGING_GROUP_NAME,
  MAX_MEMBERS_IN_GROUP_SUMMARY_SHOWN,
  MAX_MEMBERS_TO_REQUEST_IN_GROUP,
} from "utils/constants";
import { nameOrFormattedKey, SearchMenuItem } from "../components/search-users";
import { Conversation } from "../utils/types";

export function useMembers(
  setLoading: (l: boolean) => void,
  open: boolean,
  conversation?: Conversation
) {
  const { appUser } = useContext(UserContext);
  const [members, setMembers] = useState<Array<SearchMenuItem>>([]);
  const [currentMemberKeys, setCurrentMemberKeys] = useState<Array<string>>([]);

  useEffect(() => {
    if (!appUser) {
      toast.error("You must be logged in to view members");
      return;
    }

    if (!open) {
      setMembers([]);
    } else if (conversation) {
      setLoading(true);

      getPaginatedAccessGroupMembers({
        AccessGroupOwnerPublicKeyBase58Check:
          conversation.messages[0].RecipientInfo.OwnerPublicKeyBase58Check,
        AccessGroupKeyName:
          conversation.messages[0].RecipientInfo.AccessGroupKeyName,
        MaxMembersToFetch:
          MAX_MEMBERS_TO_REQUEST_IN_GROUP + MAX_MEMBERS_IN_GROUP_SUMMARY_SHOWN,
      })
        .then((res) => {
          // Keep the current user on top
          const currUserIndex = (
            res.AccessGroupMembersBase58Check ?? []
          ).indexOf(appUser.PublicKeyBase58Check);
          res.AccessGroupMembersBase58Check.splice(currUserIndex, 1);
          const sortedMembers = [
            appUser.PublicKeyBase58Check,
            ...res.AccessGroupMembersBase58Check,
          ];

          setCurrentMemberKeys(sortedMembers);
          setMembers(
            sortedMembers.map((publicKey) => ({
              id: publicKey,
              profile: res.PublicKeyToProfileEntryResponse[publicKey] ?? null,
              text: nameOrFormattedKey(
                res.PublicKeyToProfileEntryResponse[publicKey],
                publicKey
              ),
            }))
          );
        })
        .finally(() => setLoading(false));
    }
  }, [open, appUser]);

  const onPairMissing = () => {
    return toast.error(
      "This user hasn't registered a messaging key on-chain yet." +
        "\nYou can DM them now, but you can't add them to a group chat until they do this.",
      { autoClose: 10000 }
    );
  };

  const addMember = async (
    member: SearchMenuItem | null,
    onAdded?: () => void
  ) => {
    if (!member || members.find((e) => e.id === member.id)) {
      // do not add member if already added
      return;
    }

    try {
      const { PairsNotFound } = await getBulkAccessGroups({
        GroupOwnerAndGroupKeyNamePairs: [
          {
            GroupOwnerPublicKeyBase58Check: member.id,
            GroupKeyName: DEFAULT_KEY_MESSAGING_GROUP_NAME,
          },
        ],
      });

      if ((PairsNotFound || []).length > 0) {
        onPairMissing();
        return Promise.reject();
      }

      setMembers((state) => [...state, member]);
      onAdded && onAdded();
    } catch (err: any) {
      toast.error(
        `Cannot validate the selected user.\nError: ${err.toString()}`
      );
    }
  };

  const removeMember = (id: string) => {
    setMembers((state) => state.filter((e) => e.id !== id));
  };

  return {
    members,
    addMember,
    removeMember,
    onPairMissing,
    currentMemberKeys,
  };
}
