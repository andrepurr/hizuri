# syntax=docker/dockerfile:1
#
# hizuri hosted demo environment: the daemon + web UI from docker/base, plus the official
# Claude Code and Codex CLIs, so a visitor can sign in to their own plan through the vendor's
# own flow. Build docker/base first:
#
#   docker build -f docker/base/Dockerfile -t hizuri-base:promo .
#   docker build -f docker/promo/Dockerfile -t hizuri-promo:latest .

ARG BASE_IMAGE=hizuri-base:promo
FROM ${BASE_IMAGE} AS env

USER root
RUN set -eux; \
    npm install -g @anthropic-ai/claude-code @openai/codex; \
    npm cache clean --force; \
    claude --version; \
    codex --version

COPY docker/promo/rootfs/ /
RUN chmod 755 /usr/local/bin/hizuri-promo-entrypoint /usr/local/bin/hizuri-brain

# Flattened on purpose: the base image declares VOLUME /home/paseo, which would keep the home
# outside the container's own layer and so outside its disk cap (--storage-opt size).
FROM scratch
COPY --from=env / /

ENV HOME=/home/paseo \
    PASEO_HOME=/home/paseo/.paseo \
    PASEO_LISTEN=0.0.0.0:6767 \
    PASEO_WEB_UI_ENABLED=true \
    PASEO_LOG_FORMAT=json \
    PASEO_LOG_LEVEL=info \
    CLAUDE_CONFIG_DIR=/home/paseo/.claude \
    CODEX_HOME=/home/paseo/.codex \
    XDG_CONFIG_HOME=/home/paseo/.config \
    XDG_DATA_HOME=/home/paseo/.local/share \
    XDG_STATE_HOME=/home/paseo/.local/state \
    XDG_CACHE_HOME=/home/paseo/.cache \
    ONNXRUNTIME_NODE_INSTALL=skip \
    PASEO_FREE_BRAIN_ROLE_FILE=/etc/hizuri-promo/free-brain-role.md \
    PASEO_FREE_BRAIN_TOOLS= \
    PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

WORKDIR /workspace
EXPOSE 6767

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get({hostname:'127.0.0.1',port:6767,path:'/api/health'},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/hizuri-promo-entrypoint"]
