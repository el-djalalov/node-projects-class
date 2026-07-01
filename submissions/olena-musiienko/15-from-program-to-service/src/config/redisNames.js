const JOBS_QUEUE = process.env.JOBS_QUEUE || "jobs";
const POSTS_NEW_CHANNEL = process.env.POSTS_NEW_CHANNEL || "posts:new";

module.exports = {
    JOBS_QUEUE,
    POSTS_NEW_CHANNEL,
};