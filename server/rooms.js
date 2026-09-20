const channels = new Map(); // channelCode -> { users: Map(socketId -> { id, username, socketId }), currentSpeaker: null }

function getChannel(channelCode) {
    if (!channels.has(channelCode)) {
        channels.set(channelCode, {
            users: new Map(),
            currentSpeaker: null
        });
    }
    return channels.get(channelCode);
}

function addUser(channelCode, user) {
    const channel = getChannel(channelCode);
    channel.users.set(user.socketId, user);
    return channel;
}

function removeUser(channelCode, socketId) {
    const channel = channels.get(channelCode);
    if (channel) {
        channel.users.delete(socketId);
        if (channel.currentSpeaker === socketId) {
            channel.currentSpeaker = null;
        }
        if (channel.users.size === 0) {
            channels.delete(channelCode);
        }
        return channel;
    }
    return null;
}

function getUsersInChannel(channelCode) {
    const channel = channels.get(channelCode);
    if (!channel) return [];
    return Array.from(channel.users.values());
}

function requestSpeaking(channelCode, socketId) {
    const channel = channels.get(channelCode);
    if (!channel) return false;
    
    if (channel.currentSpeaker === null || channel.currentSpeaker === socketId) {
        channel.currentSpeaker = socketId;
        return true;
    }
    return false;
}

function releaseSpeaking(channelCode, socketId) {
    const channel = channels.get(channelCode);
    if (channel && channel.currentSpeaker === socketId) {
        channel.currentSpeaker = null;
        return true;
    }
    return false;
}

function getCurrentSpeaker(channelCode) {
    const channel = channels.get(channelCode);
    return channel ? channel.currentSpeaker : null;
}

module.exports = {
    getChannel,
    addUser,
    removeUser,
    getUsersInChannel,
    requestSpeaking,
    releaseSpeaking,
    getCurrentSpeaker
};
