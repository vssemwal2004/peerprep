// Student guides: Help & Support and Change password.
// Format: src/guide/platform/registry.js.

export default [
  {
    id: "student.help",
    paths: ["/student/help"],
    area: "Account",
    title: "Help & Support",
    icon: "compass",
    summary: "A written guide to PeerPrep, what happens to your data, and how to contact support.",
    intro: "Stuck or unsure how something works? This page explains the main parts of PeerPrep in writing and tells you how to reach support.\nFor a hands-on walk-through of any page, use the ⓘ next to that page's title.",
    next: "student.change-password",
    tips: [
      "Each page's own ⓘ tour is the quickest way to learn that page.",
      "The current password rules are shown on the Change password page.",
      "When you write to support, include your Student ID and what you were trying to do.",
    ],
    steps: [
      {
        id: "help-back", target: "help-back", chapter: "layout",
        title: "Go back",
        body: "Returns you to the page you came from.",
      },
      {
        id: "help-overview", target: "help-overview", chapter: "parts", quick: true,
        title: "Platform overview",
        body: "What PeerPrep is for in a few lines: learning, tracking your progress, mock interviews and feedback.",
      },
      {
        id: "help-start", target: "help-start", chapter: "parts",
        title: "Getting started",
        body: "How your account is created, your first sign-in with a temporary password, and setting up your profile.",
      },
      {
        id: "help-learning", target: "help-learning", chapter: "parts",
        title: "Learning workflow",
        body: "How to open subjects and lessons, watch videos, use notes and practice material, and mark lessons complete so your progress updates.",
      },
      {
        id: "help-interviews", target: "help-interviews", chapter: "parts",
        title: "Mock interview workflow",
        body: "How pairing works, agreeing a time with your partner, joining the meeting, and giving or receiving feedback afterwards.",
      },
      {
        id: "help-features", target: "help-features", chapter: "parts",
        title: "Important buttons",
        body: "Short explanations of buttons you will use often, such as marking a lesson complete and changing your password.",
      },
      {
        id: "help-privacy", target: "help-privacy", chapter: "parts",
        title: "Your data and privacy",
        body: "What PeerPrep stores about you, how it is used, and links to the Privacy Policy and Terms & Conditions.",
      },
      {
        id: "help-contact", target: "help-contact", chapter: "actions", quick: true,
        title: "Contact support",
        body: "When to contact support, the support email address, and quick fixes to try first, such as refreshing the page or checking your connection.",
      },
      {
        id: "help-tips", target: "help-tips", chapter: "tips", quick: true,
        title: "Tips for success",
        body: "Small habits that make a big difference before placements: stay consistent, track your progress, give good feedback and be on time.",
      },
    ],
  },
  {
    id: "student.change-password",
    paths: ["/student/change-password"],
    area: "Account",
    title: "Change password",
    icon: "key",
    summary: "Set a new password for your PeerPrep account.",
    intro: "Keep your account safe with a password only you know. This takes a minute.\nAfter the change you are signed out and sign in again with the new password.",
    tips: [
      "Never share your password, even with classmates.",
      "Use the eye icon to check what you typed before you save.",
    ],
    steps: [
      {
        id: "pw-notice", target: "pw-notice", chapter: "overview", quick: true,
        title: "You will sign in again",
        body: "Once your password is updated, you are signed out for security. Sign in again with your new password.",
      },
      {
        id: "pw-current", target: "pw-current", chapter: "parts",
        title: "Current password",
        body: "Enter the password you use now. This proves the change is yours.",
      },
      {
        id: "pw-new", target: "pw-new", chapter: "parts", quick: true,
        title: "New password",
        body: "Your new password must have at least 8 characters and include @ or #. The two checks below the box turn green when they are met.",
      },
      {
        id: "pw-confirm", target: "pw-confirm", chapter: "parts",
        title: "Confirm it",
        body: "Type the new password again. The box shows whether the two passwords match.",
      },
      {
        id: "pw-actions", target: "pw-actions", chapter: "actions", quick: true,
        title: "Update or cancel",
        body: "Update password saves the change, then a message asks you to continue to sign in. Cancel takes you back without changing anything.",
      },
    ],
  },
];
