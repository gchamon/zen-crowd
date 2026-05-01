#!/usr/bin/env bash

ZEN_DIR="$HOME/.zen"
INI="$ZEN_DIR/profiles.ini"

require_command() {
    local command_name="$1"
    if ! command -v "$command_name" &> /dev/null; then
        echo "Error: $command_name is required but not installed." >&2
        exit 1
    fi
}

parse_profile_args() {
    local usage_fn="$1"
    shift

    PROFILE_ARGS=()
    for arg in "$@"; do
        case "$arg" in
            -h|--help) "$usage_fn" ;;
            -*) echo "Unknown option: $arg" >&2; "$usage_fn" ;;
            *) PROFILE_ARGS+=("$arg") ;;
        esac
    done
}

check_profile_prereqs() {
    if [ ! -f "$INI" ]; then
        echo "Error: $INI not found." >&2
        exit 1
    fi

    require_command yq
    require_command jq
}

load_profile_lines() {
    mapfile -t PROFILE_LINES < <(yq --input-format ini '
      with_entries(select(.key | test("^Profile\\d+$"))) |
      to_entries |
      .[] |
      .value.Name + "|" + .value.Path + "|" + (.value.IsRelative // "1")
    ' "$INI")

    if [ ${#PROFILE_LINES[@]} -eq 0 ]; then
        echo "No profiles found in $INI" >&2
        exit 1
    fi
}

resolve_profile_path() {
    local name="$1" path is_relative
    for line in "${PROFILE_LINES[@]}"; do
        IFS='|' read -r pname path is_relative <<< "$line"
        if [ "$pname" = "$name" ]; then
            if [ "$is_relative" = "1" ]; then
                echo "$ZEN_DIR/$path"
            else
                echo "$path"
            fi
            return 0
        fi
    done
    echo "Profile not found: $name" >&2
    echo "Available profiles:" >&2
    for line in "${PROFILE_LINES[@]}"; do
        IFS='|' read -r pname path _ <<< "$line"
        echo "  $pname ($path)" >&2
    done
    return 1
}

select_profiles() {
    if [ ${#PROFILE_ARGS[@]} -gt 0 ]; then
        SELECTED_PROFILES=("${PROFILE_ARGS[@]}")
        return
    fi

    echo ""
    echo "Available Zen profiles:"
    i=1
    for line in "${PROFILE_LINES[@]}"; do
        IFS='|' read -r name path rel <<< "$line"
        echo "  $i. $name ($path)"
        i=$((i + 1))
    done
    echo ""
    read -rp "Select profile number: " choice

    if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt "${#PROFILE_LINES[@]}" ]; then
        echo "Invalid selection." >&2
        exit 1
    fi

    IFS='|' read -r selected_name _ _ <<< "${PROFILE_LINES[$((choice - 1))]}"
    SELECTED_PROFILES=("$selected_name")
}
