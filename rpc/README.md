# RPC

Public RPC must be a gateway in front of multiple healthy upstream nodes. The
gateway must not synthesize fake chain responses. If there is no healthy
upstream, it returns a clean error.
