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

    if GIT_TERMINAL_PROMPT=0 git -c http.version=HTTP/1.1 fetch origin main && git reset --hard origin/main; then
        success "Git обновлён"
    else
        fail "Ошибка при обновлении Git"
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

    info "Устанавливаю frontend-зависимости из lockfile..."

    if npm ci; then
        success "Frontend-зависимости установлены"
    else
        fail "Ошибка установки frontend-зависимостей"
    fi

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

    # ---------- Backend directory ----------

    cd "$PROJECT_DIR/backend" || fail "Не удалось перейти в backend"

    # ---------- Virtual Environment ----------

    info "Активирую virtual environment..."

    if [ -f "$PROJECT_DIR/backend/venv/bin/activate" ]; then
        source "$PROJECT_DIR/backend/venv/bin/activate"
        success "Virtual environment активирован"
    else
        fail "Не найден virtual environment: $PROJECT_DIR/backend/venv"
    fi

    # ---------- Dependencies ----------

    info "Устанавливаю зависимости из requirements.txt..."

    if python -m pip install -r requirements.txt; then
        success "Зависимости установлены/обновлены"
    else
        fail "Ошибка установки зависимостей. BotFlow НЕ перезапущен."
    fi

    # ---------- Database migrations ----------

    info "Применяю миграции базы данных..."

    if alembic upgrade head; then
        success "Миграции успешно применены"
    else
        fail "Ошибка миграций. BotFlow НЕ перезапущен."
    fi

    # ---------- Restart ----------

    info "Перезапускаю BotFlow..."

    if systemctl restart botflow; then
        success "BotFlow перезапущен"
    else
        fail "Ошибка перезапуска BotFlow"
    fi

    # ---------- Status ----------

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
