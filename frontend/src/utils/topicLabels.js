export function formatTopicKey(topicKey) {
  if (!topicKey) return "";
  return String(topicKey).replace(/_/g, " · ");
}

export function topicDisplayName(topicKey, topics) {
  if (!topicKey) return "";
  if (topics && topics[topicKey]?.name) return topics[topicKey].name;
  return formatTopicKey(topicKey);
}

export function topicBadgeLabel(topicKey, topics) {
  return topicDisplayName(topicKey, topics) || topicKey || "综合";
}
