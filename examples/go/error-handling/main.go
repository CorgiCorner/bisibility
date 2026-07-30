package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	bisibility "github.com/bisibility/bisibility-sdk-go"
)

const exampleID = "go-error-handling"

type expectedAPIError struct {
	Code   string
	Status int
	Title  string
}

func requiredEnv(name string) (string, error) {
	value := os.Getenv(name)
	if value == "" {
		return "", fmt.Errorf("%s is required", name)
	}
	return value, nil
}

func problemCode(err *bisibility.APIError) string {
	if err.Problem == nil {
		return ""
	}
	parts := strings.Split(err.Problem.Type, "/")
	return parts[len(parts)-1]
}

func expectAPIError(label string, expected expectedAPIError, operation func() error) error {
	err := operation()
	if err == nil {
		return fmt.Errorf("%s did not fail", label)
	}

	var apiErr *bisibility.APIError
	if !errors.As(err, &apiErr) {
		return fmt.Errorf("%s did not return *bisibility.APIError: %w", label, err)
	}
	if apiErr.StatusCode != expected.Status {
		return fmt.Errorf("%s returned status %d", label, apiErr.StatusCode)
	}
	if apiErr.Problem == nil {
		return fmt.Errorf("%s did not include problem details", label)
	}
	if apiErr.Problem.Status != expected.Status {
		return fmt.Errorf("%s problem status was %d", label, apiErr.Problem.Status)
	}
	expectedType := "https://bisibility.com/problems/" + expected.Code
	if apiErr.Problem.Type != expectedType {
		return fmt.Errorf("%s problem type was %s", label, apiErr.Problem.Type)
	}
	if code := problemCode(apiErr); code != expected.Code {
		return fmt.Errorf("%s problem code was %s", label, code)
	}
	if apiErr.Problem.Title != expected.Title {
		return fmt.Errorf("%s problem title was %s", label, apiErr.Problem.Title)
	}

	fmt.Printf("%s: %s (%s)\n", label, apiErr.Problem.Title, problemCode(apiErr))
	return nil
}

func run() error {
	apiKey, err := requiredEnv("BISIBILITY_API_KEY")
	if err != nil {
		return err
	}
	baseURL, err := requiredEnv("BISIBILITY_BASE_URL")
	if err != nil {
		return err
	}

	client, err := bisibility.NewClient(
		bisibility.WithAPIKey(apiKey),
		bisibility.WithBaseURL(baseURL),
	)
	if err != nil {
		return err
	}
	invalidClient, err := bisibility.NewClient(
		bisibility.WithAPIKey("bsb_key_test_invalid_error_handling_0001"),
		bisibility.WithBaseURL(baseURL),
	)
	if err != nil {
		return err
	}

	ctx := context.Background()
	if err := expectAPIError(
		"Invalid API key",
		expectedAPIError{Code: "unauthorized", Status: 401, Title: "Unauthorized"},
		func() error {
			_, err := invalidClient.ListProjects(ctx)
			return err
		},
	); err != nil {
		return err
	}

	if err := expectAPIError(
		"Missing keyword",
		expectedAPIError{Code: "not_found", Status: 404, Title: "Not found"},
		func() error {
			_, err := client.GetKeyword(ctx, "kw_z00000000000000000000000")
			return err
		},
	); err != nil {
		return err
	}

	projects, err := client.ListProjects(ctx)
	if err != nil {
		return err
	}
	if len(projects.Data) == 0 {
		return errors.New("no projects are available for this API key")
	}

	if err := expectAPIError(
		"Invalid keyword payload",
		expectedAPIError{Code: "validation_failed", Status: 400, Title: "Validation failed"},
		func() error {
			_, err := client.CreateKeywords(ctx, projects.Data[0].ID, bisibility.CreateKeywordsInput{
				Keywords: []bisibility.CreateKeywordInput{{Keyword: ""}},
			})
			return err
		},
	); err != nil {
		return err
	}

	fmt.Printf("OK %s\n", exampleID)
	return nil
}

func main() {
	if err := run(); err != nil {
		var apiErr *bisibility.APIError
		if errors.As(err, &apiErr) {
			fmt.Fprintf(os.Stderr, "API error %d: %s\n", apiErr.StatusCode, apiErr.Error())
		} else {
			fmt.Fprintln(os.Stderr, err)
		}
		os.Exit(1)
	}
}
