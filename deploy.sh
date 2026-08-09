#!/bin/bash

# ==========================================
# BotFlow Deploy Script
# ==========================================

set -o pipefail

PROJECT_DIR="/var/www/BotFlow"

# ---------- Colors ----------

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ---------- Helpers ----------

success() {
    echo -e "${GREEN}✓ $1${NC}"
}

error() {
    echo -e "${RED}✗ $1${NC}"
}

info() {
    echo -e "${CYAN}→ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

separator() {
    echo -e "${BLUE}==========================================${NC}"
}

fail() {
    error "$1"
    echo
    warning "Деплой остановлен."
    exit 1
}

# ---------- Check directory ----------

cd "$PROJECT_DIR" || fail "Не удалось перейти в $PROJECT_DIR"

# ---------- Help ----------

show_help() {
    echo
    separator
    echo -e "${CYAN}             BotFlow Deploy${NC}"
    separator
    echo
    echo "Использование:"
    echo
    echo -e "  ${GREEN}./deploy.sh f${NC}      Frontend"
    echo -e "  ${GREEN}./deploy.sh b${NC}      Backend"
    echo -e "  ${GREEN}./deploy.sh all${NC}    Frontend + Backend"
    echo
    echo "Что делает:"
    echo
    echo "  f   → git pull → frontend build"
    echo "  b   → git pull → restart botflow"
    echo "  all → git pull → frontend build → restart botflow"
    echo
    separator
    echo
}

# ---------- Git Pull ----------

git_update() {
    info "Получаю обновления из Git..."

    if git pull; then
        success "Git обновлён"
    else
        fail "Ошибка при выполнении git pull"
    fi
}

# ---------- Frontend ----------

deploy_frontend() {
    separator
    echo -e "${CYAN}       FRONTEND DEPLOY${NC}"
    separator
    echo

    info "Собираю frontend..."

    cd "$PROJECT_DIR/frontend" || fail "Не удалось перейти в frontend"

    if npm run build; then
        success "Frontend успешно собран"
    else
        fail "Ошибка сборки frontend"
    fi

    cd "$PROJECT_DIR" || exit 1

    echo
    success "Frontend готов"
}

# ---------- Backend ----------

deploy_backend() {
    separator
    echo -e "${CYAN}        BACKEND DEPLOY${NC}"
    separator
    echo

    info "Перезапускаю BotFlow..."

    if systemctl restart botflow; then
        success "BotFlow перезапущен"
    else
        fail "Ошибка перезапуска BotFlow"
    fi

    info "Проверяю статус BotFlow..."

    if systemctl is-active --quiet botflow; then
        success "BotFlow работает"
    else
        fail "BotFlow не запустился"
    fi

    echo
    success "Backend готов"
}

# ---------- Main ----------

case "${1:-}" in

    f)
        separator
        echo -e "${CYAN}        DEPLOY FRONTEND${NC}"
        separator
        echo

        git_update
        deploy_frontend

        echo
        separator
        success "FRONTEND УСПЕШНО ОБНОВЛЁН"
        separator
        ;;

    b)
        separator
        echo -e "${CYAN}         DEPLOY BACKEND${NC}"
        separator
        echo

        git_update
        deploy_backend

        echo
        separator
        success "BACKEND УСПЕШНО ОБНОВЛЁН"
        separator
        ;;

    all)
        separator
        echo -e "${CYAN}          DEPLOY ALL${NC}"
        separator
        echo

        git_update
        deploy_frontend
        deploy_backend

        echo
        separator
        success "BOTFLOW ПОЛНОСТЬЮ ОБНОВЛЁН"
        separator
        ;;

    *)
        show_help
        ;;

esac