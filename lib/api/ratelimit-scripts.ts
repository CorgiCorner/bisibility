export const REDIS_CONSUME_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call("ZREMRANGEBYSCORE", key, 0, now - window)
local count = redis.call("ZCARD", key)
local success = 0

if count < limit then
  redis.call("ZADD", key, now, member)
  count = count + 1
  success = 1
end

redis.call("PEXPIRE", key, window)
local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
local reset_at = now + window
if oldest[2] then
  reset_at = tonumber(oldest[2]) + window
end

return { success, limit, math.max(0, limit - count), reset_at }
`;

export const REDIS_PEEK_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

redis.call("ZREMRANGEBYSCORE", key, 0, now - window)
local count = redis.call("ZCARD", key)
local reset_at = now + window

if count > 0 then
  local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
  if oldest[2] then
    reset_at = tonumber(oldest[2]) + window
  end
  redis.call("PEXPIRE", key, window)
end

return { limit, math.max(0, limit - count), reset_at }
`;
