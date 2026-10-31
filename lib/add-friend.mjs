// Decides what to do with an "Add friend: <username>" issue. The page and the workflow share the title format.
import { isValidLogin } from "./scoring.mjs";

const TITLE_PATTERN = /^Add friend:\s*@?(\S+)\s*$/i;
// GitHub sets this per issue author, so it can't be faked by the requester.
const ALLOWED_ASSOCIATIONS = ["OWNER", "COLLABORATOR"];

export function parseRequest(title, association) {
  if (!ALLOWED_ASSOCIATIONS.includes(association)) {
    return { ok: false, message: "Only the repo owner and collaborators can add friends." };
  }
  const login = title.match(TITLE_PATTERN)?.[1];
  if (!isValidLogin(login)) {
    return { ok: false, message: "That doesn't look like a GitHub username." };
  }
  return { ok: true, login };
}

// Returns the updated file text, or null if the person is already a member.
export function addMember(fileText, login) {
  const { members } = JSON.parse(fileText);
  if (members.some((m) => m.toLowerCase() === login.toLowerCase())) return null;
  const list = [...members, login].map((m) => JSON.stringify(m)).join(", ");
  return fileText.replace(/"members":\s*\[[^\]]*\]/, () => `"members": [${list}]`);
}
