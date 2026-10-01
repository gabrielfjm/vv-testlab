def divide(a, b):
    if b == 0:
        raise ValueError("divisor não pode ser zero")
    return a / b


def is_adult(age):
    return 18 <= age <= 120
