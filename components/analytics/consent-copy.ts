export const consentCopy = {
  banner: {
    body: "We count visits without cookies. Optional analytics cookies and replays help us improve bisibility.",
    update: "Replays can include app screens. Review your choice. Analytics stays unchanged.",
    title: "Privacy choices",
  },
  modal: {
    essential: {
      body: "Required for sign-in, security and your saved settings.",
      title: "Essential",
    },
    footer:
      "Your choice is saved for 6 months. Change it anytime from Privacy choices in the footer.",
    intro: "Choose analytics and replays separately. Essential cookies stay on.",
    replay: {
      body: "Optional recordings help us improve the website and setup. In the app, recordings may include the first check and rank tracker. Inputs and project data are masked. Sign-in, account and billing screens, credentials and Google data are excluded.",
      title: "Replays",
    },
    title: "Privacy choices",
    usage: {
      body: "Pages and setup steps you use, linked across visits with an analytics cookie.",
      title: "Usage analytics",
    },
    visitCounts:
      "If you reject optional analytics, we still count visits without cookies or a persistent profile.",
  },
} as const;
