#!/usr/bin/env bash
#
# Install WordPress PHPUnit test library.
# Usage: bin/install-wp-tests.sh <db-name> <db-user> <db-pass> [db-host] [wp-version] [skip-database-creation]
#
# Uses curl/wget to download the test suite (no svn dependency).

if [ $# -lt 3 ]; then
    echo "Usage: $0 <db-name> <db-user> <db-pass> [db-host] [wp-version] [skip-database-creation]"
    exit 1
fi

DB_NAME=$1
DB_USER=$2
DB_PASS=$3
DB_HOST=${4-localhost}
WP_VERSION=${5-latest}
SKIP_DB_CREATE=${6-false}

TMPDIR=${TMPDIR-/tmp}
TMPDIR=$(echo "$TMPDIR" | sed -e "s/\/$//")
WP_TESTS_DIR=${WP_TESTS_DIR-$TMPDIR/wordpress-tests-lib}
WP_CORE_DIR=${WP_CORE_DIR-$TMPDIR/wordpress}

download() {
    if [ "$(which curl)" ]; then
        curl -sL "$1" > "$2"
    elif [ "$(which wget)" ]; then
        wget -nv -O "$2" "$1"
    fi
}

if [ "$WP_VERSION" == "latest" ]; then
    TAG=$(download https://api.wordpress.org/core/version-check/1.7/ /dev/stdout | grep -o '"version":"[^"]*"' | head -1 | sed 's/"version":"//;s/"//')
    if [ -z "$TAG" ]; then
        echo "Could not determine latest WordPress version."
        exit 1
    fi
    WP_VERSION=$TAG
fi

set -ex

install_wp() {
    if [ -d "$WP_CORE_DIR" ]; then
        return
    fi
    mkdir -p "$WP_CORE_DIR"
    download "https://wordpress.org/wordpress-$WP_VERSION.tar.gz" "$TMPDIR/wordpress.tar.gz"
    tar --strip-components=1 -zxmf "$TMPDIR/wordpress.tar.gz" -C "$WP_CORE_DIR"
    download "https://raw.github.com/markoheijnen/wp-mysqli/master/db.php" "$WP_CORE_DIR/wp-content/db.php"
}

install_test_suite() {
    if [ -d "$WP_TESTS_DIR" ] && [ -f "$WP_TESTS_DIR/includes/functions.php" ]; then
        return
    fi

    mkdir -p "$WP_TESTS_DIR"

    # Download the test suite as a tarball from GitHub (no svn needed)
    local ARCHIVE_URL="https://github.com/WordPress/wordpress-develop/archive/refs/tags/$WP_VERSION.tar.gz"
    local ARCHIVE_FILE="$TMPDIR/wp-develop-$WP_VERSION.tar.gz"
    local EXTRACT_DIR="$TMPDIR/wp-develop-$WP_VERSION"

    download "$ARCHIVE_URL" "$ARCHIVE_FILE"

    # If the tagged archive fails (some WP versions use different tag formats),
    # fall back to the trunk branch
    if [ ! -s "$ARCHIVE_FILE" ] || ! tar -tzf "$ARCHIVE_FILE" > /dev/null 2>&1; then
        echo "Tagged archive not found, falling back to trunk..."
        ARCHIVE_URL="https://github.com/WordPress/wordpress-develop/archive/refs/heads/trunk.tar.gz"
        download "$ARCHIVE_URL" "$ARCHIVE_FILE"
    fi

    mkdir -p "$EXTRACT_DIR"
    tar --strip-components=1 -zxf "$ARCHIVE_FILE" -C "$EXTRACT_DIR"

    # Copy the test includes and data directories
    cp -r "$EXTRACT_DIR/tests/phpunit/includes" "$WP_TESTS_DIR/includes"
    cp -r "$EXTRACT_DIR/tests/phpunit/data" "$WP_TESTS_DIR/data"

    # Clean up
    rm -rf "$EXTRACT_DIR" "$ARCHIVE_FILE"

    # Write config file
    if [ ! -f "$WP_TESTS_DIR/wp-tests-config.php" ]; then
        download "https://raw.githubusercontent.com/WordPress/wordpress-develop/$WP_VERSION/wp-tests-config-sample.php" "$WP_TESTS_DIR/wp-tests-config.php"

        # Fall back to trunk if the tagged config doesn't exist
        if [ ! -s "$WP_TESTS_DIR/wp-tests-config.php" ]; then
            download "https://raw.githubusercontent.com/WordPress/wordpress-develop/trunk/wp-tests-config-sample.php" "$WP_TESTS_DIR/wp-tests-config.php"
        fi

        sed -i "s:dirname( __FILE__ ) . '/src/':'$WP_CORE_DIR/':" "$WP_TESTS_DIR/wp-tests-config.php"
        sed -i "s/youremptytestdbnamehere/$DB_NAME/" "$WP_TESTS_DIR/wp-tests-config.php"
        sed -i "s/yourusernamehere/$DB_USER/" "$WP_TESTS_DIR/wp-tests-config.php"
        sed -i "s/yourpasswordhere/$DB_PASS/" "$WP_TESTS_DIR/wp-tests-config.php"
        sed -i "s|localhost|$DB_HOST|" "$WP_TESTS_DIR/wp-tests-config.php"
    fi
}

install_db() {
    if [ "$SKIP_DB_CREATE" == "true" ]; then
        return 0
    fi

    local EXTRA=""
    if [ -n "$DB_PASS" ]; then
        EXTRA=" -p$DB_PASS"
    fi

    mysqladmin create "$DB_NAME" --user="$DB_USER"$EXTRA --host="$DB_HOST" --force 2>/dev/null || true
}

install_wp
install_test_suite
install_db
